import fs from "fs-extra";
import path from "path";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

function isReadable(obj: any): obj is Readable {
  return obj && typeof obj.pipe === "function";
}
import mime from "mime-types";

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3, baseDelayMs = 250): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const jitter = Math.floor(Math.random() * 100);
      const delay = baseDelayMs * Math.pow(2, i) + jitter;
      if (i === retries) break;
      // eslint-disable-next-line no-console
      console.warn(`storage.${label}.retry`, { attempt: i + 1, delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export type PutParams = { bucket?: string; key: string; body: Buffer | string | Readable; contentType?: string };

export interface StorageDriver {
  putObject(params: PutParams): Promise<{ url?: string }>;
  listObjects(prefix: string): Promise<string[]>;
  baseUrl(): string | undefined;
}

class LocalDriver implements StorageDriver {
  constructor(private rootDir: string, private publicBase?: string) {}
  async putObject(params: PutParams) {
    const filePath = path.join(this.rootDir, params.key);
    await fs.ensureDir(path.dirname(filePath));
    if (typeof params.body === "string" || Buffer.isBuffer(params.body)) {
      await fs.writeFile(filePath, params.body as any);
    } else if (isReadable(params.body)) {
      await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(filePath);
        (params.body as Readable).pipe(ws);
        ws.on("finish", () => resolve());
        ws.on("error", reject);
      });
    } else {
      throw new Error("Unsupported body type for LocalDriver.putObject");
    }
    const url = this.publicBase ? `${this.publicBase}/${params.key}` : undefined;
    return { url };
  }
  async listObjects(prefix: string) {
    const base = path.join(this.rootDir, prefix);
    if (!(await fs.pathExists(base))) return [];
    const items: string[] = [];
    const walk = async (dir: string, rel: string) => {
      const entries = await fs.readdir(dir);
      for (const e of entries) {
        const full = path.join(dir, e);
        const r = path.join(rel, e);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) await walk(full, r);
        else items.push(path.join(prefix, r));
      }
    };
    await walk(base, "");
    return items;
  }
  baseUrl() { return this.publicBase; }
}

export function createStorage(): StorageDriver {
  const provider = process.env.STORAGE_PROVIDER || "local";
  if (provider === "local") {
    const dir = process.env.ARTIFACTS_DIR || path.resolve(process.cwd(), "artifacts");
    const baseUrl = process.env.ARTIFACTS_BASE_URL; // e.g., http://api:8080/artifacts
    return new LocalDriver(dir, baseUrl);
  }
  if (provider === "s3") {
    return new (class S3Driver implements StorageDriver {
      private s3: S3Client;
      private bucket: string;
      private publicBase?: string;
      constructor() {
        this.bucket = process.env.STORAGE_BUCKET || "";
        const region = process.env.STORAGE_REGION || "us-west-2";
        const endpoint = process.env.STORAGE_ENDPOINT || undefined;
        this.publicBase = process.env.ARTIFACTS_BASE_URL;
        this.s3 = new S3Client({
          region,
          endpoint,
          forcePathStyle: !!endpoint,
          credentials: process.env.STORAGE_ACCESS_KEY
            ? { accessKeyId: process.env.STORAGE_ACCESS_KEY!, secretAccessKey: process.env.STORAGE_SECRET_KEY! }
            : undefined,
        });
      }
      async putObject(params: PutParams) {
        const Body = typeof params.body === "string" ? Buffer.from(params.body) : params.body;
        const ContentType = params.contentType || (mime.lookup(params.key) || undefined);
        try {
          await withRetry(
            () => this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: params.key, Body, ContentType })),
            "putObject"
          );
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error("storage.putObject.error", e?.message || e);
          throw e;
        }
        const url = this.publicBase ? `${this.publicBase}/${params.key}` : undefined;
        return { url };
      }
      async listObjects(prefix: string) {
        try {
          const out = await withRetry(
            () => this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: 1000 })),
            "listObjects"
          );
          return (out.Contents || []).map((o) => o.Key!).filter(Boolean) as string[];
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error("storage.listObjects.error", e?.message || e);
          throw e;
        }
      }
      baseUrl() { return this.publicBase; }
    })();
  }
  return new LocalDriver(path.resolve(process.cwd(), "artifacts"));
}
