import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { migrate, audit as auditDb, enqueueJob, getJob, insertSlackTask } from "db";
import { UPPClient } from "upp-client";
import path from "path";
import expressStatic from "express";
import { createStorage } from "storage";
import * as prom from "prom-client";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

// Prometheus metrics
const register = new prom.Registry();
prom.collectDefaultMetrics({ register });
const httpDuration = new prom.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]
});
register.registerMetric(httpDuration);
const httpRequests = new prom.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"]
});
register.registerMetric(httpRequests);
const httpErrors = new prom.Counter({
  name: "http_errors_total",
  help: "Total HTTP error responses (5xx)",
  labelNames: ["method", "path", "status"]
});
register.registerMetric(httpErrors);

// Route-bucketed metrics (normalized dynamic segments)
const routeDuration = new prom.Histogram({
  name: "http_request_route_duration_seconds",
  help: "Duration of HTTP requests by route pattern",
  labelNames: ["method", "route", "status"],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]
});
register.registerMetric(routeDuration);
const routeRequests = new prom.Counter({
  name: "http_requests_by_route_total",
  help: "Total HTTP requests by route pattern",
  labelNames: ["method", "route", "status"]
});
register.registerMetric(routeRequests);

function normalizePath(p: string): string {
  try {
    // Replace UUIDs
    p = p.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/g, ":id");
    // Replace numeric ids
    p = p.replace(/\b\d{3,}\b/g, ":id");
    // Collapse duplicate slashes
    p = p.replace(/\/+/, "/");
    return p;
  } catch {
    return p;
  }
}

app.use(cors());
// Capture raw body for webhook verification
app.use(express.json({ limit: "2mb", verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
app.use(
  morgan("combined", {
    stream: { write: (msg) => console.log(msg.trim()) },
  })
);

// Metrics middleware (duration per request)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const seconds = Number(end - start) / 1e9;
    const path = req.path || "unknown";
    const route = req.route?.path || normalizePath(path);
    const labels = [req.method, path, String(res.statusCode)] as const;
    httpDuration.labels(...labels).observe(seconds);
    httpRequests.inc({ method: req.method, path, status: String(res.statusCode) });
    if (res.statusCode >= 500) {
      httpErrors.inc({ method: req.method, path, status: String(res.statusCode) });
    }
    // Route buckets
    routeDuration.labels(req.method, route, String(res.statusCode)).observe(seconds);
    routeRequests.inc({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
});

// Serve local artifacts if using local storage
if ((process.env.STORAGE_PROVIDER || "local") === "local") {
  const dir = process.env.ARTIFACTS_DIR || path.resolve(process.cwd(), "artifacts");
  app.use("/artifacts", expressStatic.static(dir));
}

// Request ID for trace correlation
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).requestId = req.headers["x-request-id"] || uuidv4();
  next();
});

// Health
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "api-backend" });
});

// Metrics endpoint
app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Audit helper
async function emitAudit(event: string, payload: Record<string, unknown>) {
  const record = { ts: new Date().toISOString(), event, payload };
  console.log("AUDIT", JSON.stringify(record));
  await auditDb(event, payload);
}

// Job enqueue endpoint
app.post("/enqueue", async (req, res) => {
  const { type, args } = req.body || {};
  const id = uuidv4();
  await enqueueJob({ id, type, args });
  await emitAudit("job.enqueue", { id, type, args });
  if (type === "agent.task" && args?.slack) {
    const s = args.slack as {
      channel: string; user: string; ts: string; thread_ts?: string; text: string;
    };
    await insertSlackTask({
      jobId: id,
      channelId: s.channel,
      userId: s.user,
      ts: s.ts,
      threadTs: s.thread_ts || null,
      text: s.text,
    });
  }
  res.json({ id, status: "queued" });
});

// Task status stub
app.get("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const job = await getJob(id);
  if (!job) return res.status(404).json({ error: "not_found" });
  res.json({ id: job.id, status: job.status, progress: job.progress, result: job.result });
});

// UPP webhooks
import crypto from "crypto";

app.post("/webhooks/upp", async (req: Request & { rawBody?: Buffer }, res: Response) => {
  const secret = process.env.UPP_WEBHOOK_SECRET || "";
  const sig = (req.headers["x-upp-signature"] as string) || "";
  const evtId = ((req.headers["x-upp-event-id"] as string) || "").trim();
  let ok = false;
  if (secret && req.rawBody) {
    const h = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
    const provided = (sig || "").trim();
    if (provided && provided.length === h.length) {
      ok = crypto.timingSafeEqual(Buffer.from(h, "utf8"), Buffer.from(provided, "utf8"));
    } else {
      ok = false;
    }
  }
  if (!ok && secret) {
    return res.status(401).json({ error: "invalid_signature" });
  }
  const event = req.body || {};
  await emitAudit("upp.webhook", event);
  try {
    const { insertLedger } = await import("db");
    const id = evtId || crypto.createHash("sha1").update(JSON.stringify(event)).digest("hex");
    await insertLedger({ id, source: "upp", payload: event });
  } catch (e) {
    // ignore ledger errors to not block webhook
  }
  res.status(200).send("ok");
});

// Mirror trigger
app.post("/mirror", async (req, res) => {
  const { url, slack } = req.body || {};
  const id = uuidv4();
  await enqueueJob({ id, type: "mirror", args: { url, slack } });
  await emitAudit("mirror.request", { id, url });
  res.json({ id, accepted: true });
});

// List artifacts for a job (local only)
app.get("/artifacts/:jobId", async (req, res) => {
  const jobId = req.params.jobId;
  const storage = createStorage();
  const list = await storage.listObjects(`mirror/${jobId}`);
  const base = storage.baseUrl();
  const items = list.map((key) => ({ key, url: base ? `${base}/${key}` : undefined }));
  res.json({ jobId, items });
});

// UPP: create invoice
app.post("/upp/invoice", async (req, res) => {
  const { customerEmail, items } = req.body || {};
  const client = new UPPClient();
  try {
    // For now, accept pre-serialized items or fallback demo item
    let invoiceItems: any;
    if (typeof items === "string") {
      // Simple CSV-like "sku:qty:price;sku2:qty:price"
      invoiceItems = items.split(";").map((row: string) => {
        const [sku, qty, price] = row.split(":");
        return { sku, qty: Number(qty || 1), priceCents: Number(price || 0) };
      });
    } else if (Array.isArray(items)) {
      invoiceItems = items;
    } else {
      invoiceItems = [{ sku: "demo", qty: 1, priceCents: 100 }];
    }
    const data = await client.createInvoice({ customerEmail, items: invoiceItems });
    await emitAudit("upp.invoice.created", data);
    res.json(data);
  } catch (e: any) {
    console.error("UPP_INVOICE_ERROR", e?.message || e);
    res.status(500).json({ error: "invoice_failed", message: e?.message || String(e) });
  }
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("ERROR", err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(port, async () => {
  await migrate();
  console.log(`api-backend listening on :${port}`);
});
