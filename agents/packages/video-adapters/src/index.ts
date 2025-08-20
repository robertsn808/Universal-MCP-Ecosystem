import axios, { AxiosInstance, AxiosError } from "axios";
import { EventEmitter } from "events";

export type ProviderName = "runway" | "luma" | "pika";

export type StartParams = {
  prompt?: string;
  seed?: number;
  durationSeconds?: number;
  style?: string;
};

export type Artifact = { url: string; filename?: string; contentType?: string };

export type JobStatus = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progress: number;
  artifacts?: Artifact[];
  error?: string;
};

export interface VideoProvider {
  start(params: StartParams): Promise<{ id: string }>;
  status(id: string): Promise<JobStatus>;
  ping?(): Promise<boolean>; // optional health check
}

function getDot(obj: any, path: string): any {
  if (!path) return undefined;
  return path.split(".").reduce((acc: any, key: string) => (acc ? acc[key] : undefined), obj);
}

function backoff(attempt: number, base = 250): number {
  return base * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
}
function sanitizeParams(p: StartParams): Required<Pick<StartParams,'prompt'|'durationSeconds'>> & Partial<StartParams> {
  const prompt = String(p.prompt || '').trim().slice(0, 1024);
  let duration = Number.isFinite(p.durationSeconds as any) ? Number(p.durationSeconds) : 4;
  if (duration < 1) duration = 1;
  if (duration > 60) duration = 60;
  const style = p.style ? String(p.style).trim().slice(0, 64) : undefined;
  const seed = typeof p.seed === 'number' && Number.isInteger(p.seed) ? p.seed : undefined;
  return { prompt, durationSeconds: duration, style, seed } as any;
}

async function httpWithRetry<T>(http: AxiosInstance, op: () => Promise<T>, label: string, max = 5): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < max; i++) {
    try {
      return await op();
    } catch (e: any) {
      lastErr = e;
      const status = (e as AxiosError)?.response?.status;
      // Retry on 429 and 5xx
      if (status && status !== 429 && (status < 500 || status >= 600)) break;
      const delay = backoff(i, 300);
      // eslint-disable-next-line no-console
      console.warn(`video-adapters.${label}.retry`, { attempt: i + 1, delay, status });
      events.emit('retry', { label, attempt: i + 1, delay, status });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export class RunwayProvider implements VideoProvider {
  private http: AxiosInstance;
  constructor() {
    const baseURL = process.env.RUNWAY_BASE_URL || "https://api.runwayml.com";
    this.http = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${process.env.RUNWAY_API_KEY || ""}`, Accept: "application/json" },
      timeout: 15000,
    });
  }
  private mapping() {
    const preset = (process.env.RUNWAY_PRESET || 'default').toLowerCase();
    if (preset === 'files') {
      return {
        idPath: process.env.RUNWAY_ID_PATH || 'id',
        statusField: process.env.RUNWAY_STATUS_FIELD || 'state',
        progressField: process.env.RUNWAY_PROGRESS_FIELD || 'progress',
        artifactsPath: process.env.RUNWAY_ARTIFACTS_PATH || 'files',
        artifactUrlField: process.env.RUNWAY_ARTIFACT_URL_FIELD || 'download_url',
        artifactCtField: process.env.RUNWAY_ARTIFACT_CONTENT_TYPE_FIELD || 'mime',
        artifactNameField: process.env.RUNWAY_ARTIFACT_FILENAME_FIELD || 'name',
        statusMap: process.env.RUNWAY_STATUS_MAP ? JSON.parse(process.env.RUNWAY_STATUS_MAP) : undefined,
      } as const;
    }
    return {
      idPath: process.env.RUNWAY_ID_PATH || 'id',
      statusField: process.env.RUNWAY_STATUS_FIELD || 'status',
      progressField: process.env.RUNWAY_PROGRESS_FIELD || 'progress',
      artifactsPath: process.env.RUNWAY_ARTIFACTS_PATH || 'artifacts',
      artifactUrlField: process.env.RUNWAY_ARTIFACT_URL_FIELD || 'url',
      artifactCtField: process.env.RUNWAY_ARTIFACT_CONTENT_TYPE_FIELD || 'content_type',
      artifactNameField: process.env.RUNWAY_ARTIFACT_FILENAME_FIELD || 'filename',
      statusMap: process.env.RUNWAY_STATUS_MAP ? JSON.parse(process.env.RUNWAY_STATUS_MAP) : undefined,
    } as const;
  }
  async ping(): Promise<boolean> {
    // If not in real mode, simulated is considered healthy
    if (process.env.RUNWAY_USE_REAL !== '1') return true;
    try {
      await httpWithRetry(this.http, () => this.http.head('/'), 'runway.ping');
      return true;
    } catch {
      return false;
    }
  }
  async start(_params: StartParams): Promise<{ id: string }> {
    if (!process.env.RUNWAY_API_KEY) {
      // Simulated ID when not configured
      return { id: `sim-${Date.now()}` };
    }
    if (process.env.RUNWAY_USE_REAL === '1') {
      const endpoint = process.env.RUNWAY_START_ENDPOINT || "/v1/videos";
      const { idPath } = this.mapping();
      const sp = sanitizeParams(_params);
      const payload: any = { prompt: sp.prompt, duration: sp.durationSeconds, style: sp.style, seed: sp.seed };
      const res = await httpWithRetry(this.http, () => this.http.post(endpoint, payload), "runway.start");
      const id = getDot(res.data, idPath);
      if (!id) throw new Error('Runway start response missing id (check RUNWAY_ID_PATH)');
      return { id: String(id) };
    }
    return { id: `sim-${Date.now()}` };
  }
  async status(id: string): Promise<JobStatus> {
    if (!process.env.RUNWAY_API_KEY || id.startsWith("sim-")) {
      // Simulated progress
      const n = Date.now() - Number(id.split("-")[1] || Date.now());
      const progress = Math.max(5, Math.min(100, Math.round(n / 200)));
      const done = progress >= 100;
      return {
        id,
        status: done ? "succeeded" : "running",
        progress,
        artifacts: done ? [{ url: "data:video/mp4;base64,", filename: "output.mp4", contentType: "video/mp4" }] : [],
      };
    }
    if (process.env.RUNWAY_USE_REAL === '1') {
      const template = process.env.RUNWAY_STATUS_ENDPOINT || "/v1/videos/{id}";
      const url = template.replace('{id}', encodeURIComponent(id));
      const res = await httpWithRetry(this.http, () => this.http.get(url), "runway.status");
      const data = res.data;
      const { statusField, progressField, artifactsPath, artifactUrlField, artifactCtField, artifactNameField, statusMap } = this.mapping();

      const rawStatus = getDot(data, statusField);
      let mapped: JobStatus['status'];
      const s = String(rawStatus || '').toLowerCase();
      if (statusMap && statusMap[s]) mapped = statusMap[s];
      else if (/(success|done|complete)/.test(s)) mapped = 'succeeded';
      else if (/(fail|error|cancel)/.test(s)) mapped = 'failed';
      else if (/(queue)/.test(s)) mapped = 'queued';
      else mapped = 'running';

      const progressRaw = getDot(data, progressField);
      const progress = Math.max(0, Math.min(100, Number(progressRaw ?? 0)));
      const arts = getDot(data, artifactsPath) || [];
      const artifacts: Artifact[] = Array.isArray(arts)
        ? arts.map((a: any) => ({
            url: String(a[artifactUrlField] || ''),
            contentType: a[artifactCtField] ? String(a[artifactCtField]) : undefined,
            filename: a[artifactNameField] ? String(a[artifactNameField]) : undefined,
          }))
        : [];
      return { id, status: mapped, progress, artifacts };
    }
    return { id, status: "running", progress: 10 };
  }
}

// Global event bus to observe adapter internals (e.g., retries)
export const events = new EventEmitter();

export class LumaProvider implements VideoProvider {
  private http: AxiosInstance;
  constructor() {
    const baseURL = process.env.LUMA_BASE_URL || "https://api.lumalabs.ai";
    this.http = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${process.env.LUMA_API_KEY || ""}` },
      timeout: 15000,
    });
  }
  async start(_params: StartParams): Promise<{ id: string }> {
    if (!process.env.LUMA_API_KEY) return { id: `sim-${Date.now()}` };
    if (process.env.LUMA_USE_REAL === '1') {
      const endpoint = process.env.LUMA_START_ENDPOINT || "/v1/videos";
      const idPath = process.env.LUMA_ID_PATH || 'id';
      const sp = sanitizeParams(_params);
      const payload: any = { prompt: sp.prompt, duration: sp.durationSeconds, style: sp.style, seed: sp.seed };
      const res = await httpWithRetry(this.http, () => this.http.post(endpoint, payload), "luma.start");
      const id = getDot(res.data, idPath);
      if (!id) throw new Error('Luma start response missing id (check LUMA_ID_PATH)');
      return { id: String(id) };
    }
    return { id: `sim-${Date.now()}` };
  }
  async status(id: string): Promise<JobStatus> {
    if (!process.env.LUMA_API_KEY || id.startsWith("sim-")) {
      const n = Date.now() - Number(id.split("-")[1] || Date.now());
      const progress = Math.max(5, Math.min(100, Math.round(n / 220)));
      const done = progress >= 100;
      return {
        id,
        status: done ? "succeeded" : "running",
        progress,
        artifacts: done ? [{ url: "data:video/mp4;base64,", filename: "output.mp4", contentType: "video/mp4" }] : [],
      };
    }
    if (process.env.LUMA_USE_REAL === '1') {
      const template = process.env.LUMA_STATUS_ENDPOINT || "/v1/videos/{id}";
      const url = template.replace('{id}', encodeURIComponent(id));
      const res = await httpWithRetry(this.http, () => this.http.get(url), "luma.status");
      const data = res.data;
      const statusField = process.env.LUMA_STATUS_FIELD || 'status';
      const progressField = process.env.LUMA_PROGRESS_FIELD || 'progress';
      const artifactsPath = process.env.LUMA_ARTIFACTS_PATH || 'artifacts';
      const artifactUrlField = process.env.LUMA_ARTIFACT_URL_FIELD || 'url';
      const artifactCtField = process.env.LUMA_ARTIFACT_CONTENT_TYPE_FIELD || 'content_type';
      const artifactNameField = process.env.LUMA_ARTIFACT_FILENAME_FIELD || 'filename';
      const rawStatus = getDot(data, statusField);
      const s = String(rawStatus || '').toLowerCase();
      const statusMap = process.env.LUMA_STATUS_MAP ? JSON.parse(process.env.LUMA_STATUS_MAP) : undefined;
      let mapped: JobStatus['status'];
      if (statusMap && statusMap[s]) mapped = statusMap[s];
      else if (/(success|done|complete)/.test(s)) mapped = 'succeeded';
      else if (/(fail|error|cancel)/.test(s)) mapped = 'failed';
      else if (/(queue)/.test(s)) mapped = 'queued';
      else mapped = 'running';
      const progressRaw = getDot(data, progressField);
      const progress = Math.max(0, Math.min(100, Number(progressRaw ?? 0)));
      const arts = getDot(data, artifactsPath) || [];
      const artifacts: Artifact[] = Array.isArray(arts)
        ? arts.map((a: any) => ({ url: String(a[artifactUrlField] || ''), contentType: a[artifactCtField] ? String(a[artifactCtField]) : undefined, filename: a[artifactNameField] ? String(a[artifactNameField]) : undefined }))
        : [];
      return { id, status: mapped, progress, artifacts };
    }
    return { id, status: "running", progress: 10 };
  }
  async ping(): Promise<boolean> {
    if (process.env.LUMA_USE_REAL !== '1') return true;
    try {
      await httpWithRetry(this.http, () => this.http.head('/'), 'luma.ping');
      return true;
    } catch {
      return false;
    }
  }
}

export class PikaProvider implements VideoProvider {
  private http: AxiosInstance;
  constructor() {
    const baseURL = process.env.PIKA_BASE_URL || "https://api.pika.art";
    this.http = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${process.env.PIKA_API_KEY || ""}` },
      timeout: 15000,
    });
  }
  async start(_params: StartParams): Promise<{ id: string }> {
    if (!process.env.PIKA_API_KEY) return { id: `sim-${Date.now()}` };
    if (process.env.PIKA_USE_REAL === '1') {
      const endpoint = process.env.PIKA_START_ENDPOINT || "/v1/videos";
      const idPath = process.env.PIKA_ID_PATH || 'id';
      const sp = sanitizeParams(_params);
      const payload: any = { prompt: sp.prompt, duration: sp.durationSeconds, style: sp.style, seed: sp.seed };
      const res = await httpWithRetry(this.http, () => this.http.post(endpoint, payload), "pika.start");
      const id = getDot(res.data, idPath);
      if (!id) throw new Error('Pika start response missing id (check PIKA_ID_PATH)');
      return { id: String(id) };
    }
    return { id: `sim-${Date.now()}` };
  }
  async status(id: string): Promise<JobStatus> {
    if (!process.env.PIKA_API_KEY || id.startsWith("sim-")) {
      const n = Date.now() - Number(id.split("-")[1] || Date.now());
      const progress = Math.max(5, Math.min(100, Math.round(n / 180)));
      const done = progress >= 100;
      return {
        id,
        status: done ? "succeeded" : "running",
        progress,
        artifacts: done ? [{ url: "data:video/mp4;base64,", filename: "output.mp4", contentType: "video/mp4" }] : [],
      };
    }
    if (process.env.PIKA_USE_REAL === '1') {
      const template = process.env.PIKA_STATUS_ENDPOINT || "/v1/videos/{id}";
      const url = template.replace('{id}', encodeURIComponent(id));
      const res = await httpWithRetry(this.http, () => this.http.get(url), "pika.status");
      const data = res.data;
      const statusField = process.env.PIKA_STATUS_FIELD || 'status';
      const progressField = process.env.PIKA_PROGRESS_FIELD || 'progress';
      const artifactsPath = process.env.PIKA_ARTIFACTS_PATH || 'artifacts';
      const artifactUrlField = process.env.PIKA_ARTIFACT_URL_FIELD || 'url';
      const artifactCtField = process.env.PIKA_ARTIFACT_CONTENT_TYPE_FIELD || 'content_type';
      const artifactNameField = process.env.PIKA_ARTIFACT_FILENAME_FIELD || 'filename';
      const rawStatus = getDot(data, statusField);
      const s = String(rawStatus || '').toLowerCase();
      const statusMap = process.env.PIKA_STATUS_MAP ? JSON.parse(process.env.PIKA_STATUS_MAP) : undefined;
      let mapped: JobStatus['status'];
      if (statusMap && statusMap[s]) mapped = statusMap[s];
      else if (/(success|done|complete)/.test(s)) mapped = 'succeeded';
      else if (/(fail|error|cancel)/.test(s)) mapped = 'failed';
      else if (/(queue)/.test(s)) mapped = 'queued';
      else mapped = 'running';
      const progressRaw = getDot(data, progressField);
      const progress = Math.max(0, Math.min(100, Number(progressRaw ?? 0)));
      const arts = getDot(data, artifactsPath) || [];
      const artifacts: Artifact[] = Array.isArray(arts)
        ? arts.map((a: any) => ({ url: String(a[artifactUrlField] || ''), contentType: a[artifactCtField] ? String(a[artifactCtField]) : undefined, filename: a[artifactNameField] ? String(a[artifactNameField]) : undefined }))
        : [];
      return { id, status: mapped, progress, artifacts };
    }
    return { id, status: "running", progress: 10 };
  }
  async ping(): Promise<boolean> {
    if (process.env.PIKA_USE_REAL !== '1') return true;
    try {
      await httpWithRetry(this.http, () => this.http.head('/'), 'pika.ping');
      return true;
    } catch {
      return false;
    }
  }
}

export function createProvider(name: ProviderName): VideoProvider {
  switch (name) {
    case "runway": return new RunwayProvider();
    case "luma": return new LumaProvider();
    case "pika": return new PikaProvider();
    default: return new RunwayProvider();
  }
}
