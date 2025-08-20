// Simple interval-based worker loop
import axios from "axios";
import { WebClient } from "@slack/web-api";
import { claimJobs, updateJob, migrate, enqueueJob } from "db";
import { routeIntent } from "intent-router";
import { createStorage } from "storage";
import { createProvider, ProviderName, StartParams, events as videoEvents } from "video-adapters";
import { Readable } from "stream";
import * as cheerio from "cheerio";
import * as http from "http";
import * as prom from "prom-client";

type Job = { id: string; type: string; args?: Record<string, unknown> };

// Metrics setup
const metricsRegister = new prom.Registry();
prom.collectDefaultMetrics({ register: metricsRegister });
const jobsTotal = new prom.Counter({ name: "worker_jobs_total", help: "Total jobs processed", labelNames: ["type", "status"] });
const jobDuration = new prom.Histogram({ name: "worker_job_duration_seconds", help: "Job duration in seconds", labelNames: ["type", "status"], buckets: [0.5,1,2,5,10,30,60,120,300] });
const videoArtifacts = new prom.Counter({ name: "worker_video_artifacts_uploaded_total", help: "Artifacts uploaded for video jobs", labelNames: ["provider"] });
metricsRegister.registerMetric(jobsTotal);
metricsRegister.registerMetric(jobDuration);
metricsRegister.registerMetric(videoArtifacts);
const adapterRequests = new prom.Counter({ name: "worker_adapter_requests_total", help: "Video adapter start/status calls", labelNames: ["provider","method","outcome"] });
const adapterDuration = new prom.Histogram({ name: "worker_adapter_request_duration_seconds", help: "Duration of adapter calls", labelNames: ["provider","method","outcome"], buckets: [0.05,0.1,0.2,0.5,1,2,5] });
metricsRegister.registerMetric(adapterRequests);
metricsRegister.registerMetric(adapterDuration);
const adapterRetries = new prom.Counter({ name: "worker_adapter_retries_total", help: "Adapter HTTP retries", labelNames: ["provider","method","status"] });
metricsRegister.registerMetric(adapterRetries);
const providerHealth = new prom.Gauge({ name: "worker_provider_health", help: "Provider health (1 ok, 0 down)", labelNames: ["provider","mode"] });
metricsRegister.registerMetric(providerHealth);

function startMetricsServer() {
  const port = Number(process.env.WORKER_METRICS_PORT || 9101);
  const server = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.setHeader("Content-Type", metricsRegister.contentType);
      res.end(await metricsRegister.metrics());
      return;
    }
    res.statusCode = 404; res.end("not found");
  });
  server.listen(port, () => console.log(`metrics listening on :${port}`));
}

async function fetchJobs(): Promise<Job[]> {
  return claimJobs(5, process.env.WORKER_ID || "worker-1");
}

async function processJob(job: Job) {
  console.log("WORKER job.start", job);
  const started = process.hrtime.bigint();
  let finalStatus: "done" | "error" = "done";
  switch (job.type) {
    case "mirror":
      await updateJob(job.id, { progress: 10 });
      try {
        const storage = createStorage();
        const args = (job as any).args || {};
        const startUrl = args.url as string;
        let pagesCount = 0;
        // Domain allowlist
        const allowlist = (process.env.MIRROR_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
        const base = new URL(startUrl);
        if (allowlist.length && !allowlist.includes(base.hostname)) {
          throw new Error(`domain_not_allowed: ${base.hostname}`);
        }
        // robots.txt respect (basic Disallow for User-agent: *)
        type Robots = { disallow: string[]; allow: string[] };
        const robots: Robots = { disallow: [], allow: [] };
        try {
          const r = await axios.get<string>(new URL("/robots.txt", base.origin).href, { timeout: 5000, responseType: "text" });
          const lines = (r.data || "").split(/\r?\n/);
          let uaStar = false;
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const [kRaw, vRaw] = trimmed.split(":", 2);
            const k = (kRaw || "").toLowerCase().trim();
            const v = (vRaw || "").trim();
            if (k === "user-agent") uaStar = v === "*";
            else if (uaStar && k === "disallow") robots.disallow.push(v);
            else if (uaStar && k === "allow") robots.allow.push(v);
          }
        } catch {
          // ignore robots fetch errors
        }
        const isAllowedPath = (path: string) => {
          // If any Allow matches prefix, consider allowed; otherwise ensure no Disallow matches
          if (robots.allow.some((p) => path.startsWith(p))) return true;
          if (robots.disallow.some((p) => p && path.startsWith(p))) return false;
          return true;
        };
        const visited = new Set<string>();
        const toVisit: string[] = [startUrl];
        const maxPages = 10;
        const pages: { url: string; key: string }[] = [];
        while (toVisit.length && pages.length < maxPages) {
          const url = toVisit.shift()!;
          if (visited.has(url)) continue;
          visited.add(url);
          try {
            const resp = await axios.get<string>(url, { timeout: 10000, responseType: "text" });
            const html = resp.data as unknown as string;
            const $ = cheerio.load(html);
            const slug = url === startUrl ? "index" : url.replace(base.origin, "").replace(/[^a-z0-9/_-]+/gi, "-").replace(/^\/+/, "");
            if (!isAllowedPath("/" + slug.replace(/^index$/, ""))) {
              continue;
            }
            const key = `mirror/${job.id}/${slug || "page"}.html`;
            await storage.putObject({ key, body: html, contentType: "text/html" });
            pages.push({ url, key });
            $("a[href]").each((_i, el) => {
              const href = ($(el).attr("href") || "").trim();
              if (!href) return;
              let next: string | null = null;
              try { next = new URL(href, base.origin).href; } catch {}
              if (next && next.startsWith(base.origin) && !visited.has(next)) {
                toVisit.push(next);
              }
            });
            // Progress update roughly by pages crawled
            const pct = Math.min(90, Math.round((pages.length / maxPages) * 90));
            await updateJob(job.id, { progress: pct });
          } catch (e) {
            // skip errors per-page
          }
        }
        await storage.putObject({ key: `mirror/${job.id}/index.json`, body: JSON.stringify({ pages }, null, 2), contentType: "application/json" });
        pagesCount = pages.length;
        await updateJob(job.id, { progress: 100, status: "done", result: { pages: pagesCount } });

        // If slack context provided, post artifacts link
        if (args.slack) {
          const token = process.env.SLACK_BOT_TOKEN;
          if (token) {
            const slack = new WebClient(token);
            const channel = args.slack.channel;
            const thread_ts = args.slack.thread_ts || args.slack.ts;
            const baseUrl = process.env.ARTIFACTS_BASE_URL || storage.baseUrl();
            const listUrl = baseUrl
              ? `${baseUrl}/mirror/${job.id}/index.json`
              : `${process.env.API_BASE_URL || "http://api-backend:8080"}/artifacts/${job.id}`;
            await slack.chat.postMessage({ channel, thread_ts, text: `Mirror completed (${pages.length} pages). Artifacts: ${listUrl}` });
          }
        }
        // Optional: notify rebuild hook
        try {
          const hook = process.env.WEB_REBUILD_URL;
          if (hook) {
            await axios.post(hook, { jobId: job.id, type: "mirror", count: pagesCount });
          }
        } catch (e) {
          // best-effort
        }
      } catch (e: any) {
        await updateJob(job.id, { status: "error", result: { error: e?.message || String(e) } });
        finalStatus = "error";
      }
      break;
    case "video.make": {
      await updateJob(job.id, { progress: 5 });
      const storage = createStorage();
      const args = (job as any).args || {};
      const providerName = (args.provider || "runway") as ProviderName;
      const provider = createProvider(providerName);
      const params: StartParams = {
        prompt: args.prompt as string | undefined,
        durationSeconds: args.duration ? Number(args.duration) : undefined,
        style: args.style as string | undefined,
        seed: args.seed ? Number(args.seed) : undefined,
      };
      try {
        let externalId = "";
        {
          const t0 = process.hrtime.bigint();
          try {
            const out = await provider.start(params);
            externalId = out.id;
            const secs = Number(process.hrtime.bigint() - t0) / 1e9;
            adapterRequests.inc({ provider: providerName, method: "start", outcome: "ok" });
            adapterDuration.labels(providerName, "start", "ok").observe(secs);
          } catch (e) {
            const secs = Number(process.hrtime.bigint() - t0) / 1e9;
            adapterRequests.inc({ provider: providerName, method: "start", outcome: "error" });
            adapterDuration.labels(providerName, "start", "error").observe(secs);
            throw e;
          }
        }
        let progress = 5;
        for (let i = 0; i < 200; i++) {
          let st;
          {
            const t0 = process.hrtime.bigint();
            try {
              st = await provider.status(externalId);
              const secs = Number(process.hrtime.bigint() - t0) / 1e9;
              adapterRequests.inc({ provider: providerName, method: "status", outcome: "ok" });
              adapterDuration.labels(providerName, "status", "ok").observe(secs);
            } catch (e) {
              const secs = Number(process.hrtime.bigint() - t0) / 1e9;
              adapterRequests.inc({ provider: providerName, method: "status", outcome: "error" });
              adapterDuration.labels(providerName, "status", "error").observe(secs);
              throw e;
            }
          }
          progress = Math.max(progress, st.progress);
          await updateJob(job.id, { progress });
          if (st.status === "succeeded") {
            // Download and upload artifacts
            const files: string[] = [];
            for (const art of st.artifacts || []) {
              const filename = art.filename || `output-${files.length + 1}.mp4`;
              const key = `video/${job.id}/${filename}`;
              // Stream download if http(s), otherwise treat as data URL
              if (art.url.startsWith("http")) {
                const resp = await axios.get(art.url, { responseType: "stream" });
                await storage.putObject({ key, body: resp.data as Readable, contentType: art.contentType || resp.headers["content-type"] });
              } else if (art.url.startsWith("data:")) {
                // Minimal data url handler
                const b64 = art.url.split(",")[1] || "";
                const buf = Buffer.from(b64, "base64");
                await storage.putObject({ key, body: buf, contentType: art.contentType || "video/mp4" });
              }
              files.push(key);
            }
            await updateJob(job.id, { progress: 100, status: "done", result: { files, provider: providerName, externalId } });
            videoArtifacts.inc({ provider: providerName }, (st.artifacts || []).length || 0);
            return;
          }
          if (st.status === "failed" || st.status === "canceled") {
            await updateJob(job.id, { status: "error", result: { provider: providerName, externalId, error: st.error || st.status } });
            finalStatus = "error";
            return;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        // Timeout
        await updateJob(job.id, { status: "error", result: { provider: providerName, error: "timeout" } });
        finalStatus = "error";
      } catch (e: any) {
        await updateJob(job.id, { status: "error", result: { provider: providerName, error: e?.message || String(e) } });
        finalStatus = "error";
      }
      break;
    }
    case "invoice.create":
      // TODO: call UPP via api-backend
      await updateJob(job.id, { progress: 100, status: "done", result: { invoiceId: "demo" } });
      break;
    case "agent.task": {
      // Minimal placeholder: post a reply confirming completion.
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) {
        console.warn("Missing SLACK_BOT_TOKEN for agent.task responses");
        await updateJob(job.id, { status: "error", result: { reason: "no_slack_token" } });
        break;
      }
      const slack = new WebClient(token);
      const args = (job as any).args || {};
      const s = args.slack || {};
      const channel = s.channel;
      const thread_ts = s.thread_ts || s.ts;
      const user = s.user;
      const text = args.text || s.text || "";
      const intent = routeIntent(text);
      await slack.chat.postMessage({ channel, thread_ts, text: `Understood (<@${user}>): ${intent.type}. Starting…` });
      await updateJob(job.id, { progress: 10 });

      // Route to specific actions
      const apiBase = process.env.API_BASE_URL || "http://api-backend:8080";
      try {
        switch (intent.type) {
          case "mirror": {
            await slack.chat.postMessage({ channel, thread_ts, text: `Queuing mirror for ${intent.args.url}…` });
            const r = await axios.post(`${apiBase}/mirror`, { url: intent.args.url, slack: { channel, thread_ts, user, ts: s.ts } });
            await slack.chat.postMessage({ channel, thread_ts, text: `Mirror accepted. Job ID: ${r.data.id}` });
            await updateJob(job.id, { progress: 100, status: "done", result: { mirrorJobId: r.data.id } });
            break;
          }
          case "video.make": {
            await slack.chat.postMessage({ channel, thread_ts, text: `Queuing video generation…` });
            const vidJobId = `${job.id}:video:${Date.now()}`;
            const provider = (intent.args as any).provider || "runway";
            await enqueueJob({ id: vidJobId, type: "video.make", args: { provider } });
            await updateJob(job.id, { progress: 100, status: "done", result: { videoJobId: vidJobId, provider } });
            await slack.chat.postMessage({ channel, thread_ts, text: `Video job queued (${provider}). Job ID: ${vidJobId}` });
            break;
          }
          case "invoice.create": {
            await slack.chat.postMessage({ channel, thread_ts, text: `Creating invoice…` });
            try {
              const r = await axios.post(`${apiBase}/upp/invoice`, {
                customerEmail: intent.args.customerEmail,
                items: intent.args.items,
              });
              await updateJob(job.id, { progress: 100, status: "done", result: r.data });
              await slack.chat.postMessage({ channel, thread_ts, text: `Invoice created: ${r.data.id}\nPay: ${r.data.payLink}` });
            } catch (e: any) {
              await updateJob(job.id, { status: "error", result: { error: e?.message } });
              await slack.chat.postMessage({ channel, thread_ts, text: `Invoice failed: ${e?.message || e}` });
            }
            break;
          }
          case "pos.plan": {
            const plan = `POS Migration Plan (Toast → UPP POS)\n- Phase 1: Pilot terminal + UPP gateway\n- Phase 2: Menu sync + receipts\n- Phase 3: Offline mode + shift reports\n- Phase 4: Full cutover + hardware swap`;
            await updateJob(job.id, { progress: 100, status: "done", result: { posted: true } });
            await slack.chat.postMessage({ channel, thread_ts, text: plan });
            break;
          }
          case "deploy": {
            await slack.chat.postMessage({ channel, thread_ts, text: `Triggering deploy (placeholder).` });
            await updateJob(job.id, { progress: 100, status: "done", result: { triggered: true } });
            break;
          }
          case "task.status": {
            const id = intent.args.id || "";
            if (!id) { await slack.chat.postMessage({ channel, thread_ts, text: `Provide a task id.` }); break; }
            const r = await axios.get(`${apiBase}/tasks/${id}`);
            await slack.chat.postMessage({ channel, thread_ts, text: `Task ${id}: ${r.data.status} (${r.data.progress}%)` });
            await updateJob(job.id, { progress: 100, status: "done" });
            break;
          }
          default: {
            // Generic completion
            await slack.chat.postMessage({ channel, thread_ts, text: `Completed: “${text}” (general note).` });
            await updateJob(job.id, { progress: 100, status: "done", result: { message: "posted" } });
          }
        }
      } catch (err: any) {
        await updateJob(job.id, { status: "error", result: { error: err?.message || String(err) } });
        await slack.chat.postMessage({ channel, thread_ts, text: `Error: ${err?.message || err}` });
      }
      break;
    }
    default:
      console.warn("Unknown job type", job.type);
  }
  console.log("WORKER job.done", job.id);
  const ended = process.hrtime.bigint();
  const seconds = Number(ended - started) / 1e9;
  jobsTotal.inc({ type: job.type, status: finalStatus });
  jobDuration.labels(job.type, finalStatus).observe(seconds);
}

async function main() {
  console.log("worker starting");
  try { await migrate(); } catch (e) { console.error("MIGRATE_ERROR", e); }
  console.log("worker started");
  startMetricsServer();
  // Subscribe to adapter retry events
  videoEvents.on('retry', (ev: any) => {
    try {
      const label: string = String(ev?.label || "");
      const [provider, method] = label.split('.') as [ProviderName, string];
      const status = ev?.status ? String(ev.status) : 'retry';
      adapterRetries.inc({ provider, method, status });
    } catch (e) {
      // ignore
    }
  });
  // Initial provider health checks (best-effort)
  const providers: ProviderName[] = ["runway", "luma", "pika"];
  for (const name of providers) {
    try {
      const p = createProvider(name);
      const mode = process.env[`${name.toUpperCase()}_USE_REAL`] === '1' ? 'real' : 'simulated';
      let healthy = true;
      if (typeof (p as any).ping === 'function') {
        healthy = await (p as any).ping();
      }
      providerHealth.set({ provider: name, mode }, healthy ? 1 : 0);
    } catch {
      providerHealth.set({ provider: name, mode: 'unknown' }, 0);
    }
  }
  setInterval(async () => {
    try {
      const jobs = await fetchJobs();
      for (const j of jobs) await processJob(j);
    } catch (e) {
      console.error("WORKER_LOOP_ERROR", e);
    }
  }, 5000);
}

main();
