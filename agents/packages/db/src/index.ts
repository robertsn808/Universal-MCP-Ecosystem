import { Pool } from "pg";
import { TABLES_SQL } from "./migrations";

const skipDb = process.env.SKIP_DB === "1";
const connectionString = process.env.DATABASE_URL || "";
export const pool = skipDb ? (null as any) : new Pool({ connectionString });

// In-memory store for skipDb mode
const mem: {
  jobs: any[];
  slackTasks: any[];
  ledger: Record<string, any>;
} = { jobs: [], slackTasks: [], ledger: {} };

export async function migrate() {
  if (skipDb) return;
  await pool.query(TABLES_SQL);
}

export async function audit(event: string, payload: unknown) {
  if (skipDb) {
    console.log("AUDIT[skipDb]", event, payload);
    return;
  }
  await pool.query(
    "INSERT INTO audits(event, payload) VALUES ($1, $2)",
    [event, JSON.stringify(payload)]
  );
}

export type JobRecord = {
  id: string;
  type: string;
  args: any;
  status: "queued" | "in_progress" | "done" | "error";
  progress: number;
  result?: any;
  worker_id?: string | null;
};

export async function enqueueJob(job: { id: string; type: string; args?: any }) {
  if (skipDb) {
    mem.jobs.push({ id: job.id, type: job.type, args: job.args || {}, status: "queued", progress: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return;
  }
  await pool.query(
    "INSERT INTO jobs(id, type, args, status, progress) VALUES ($1,$2,$3,'queued',0)",
    [job.id, job.type, JSON.stringify(job.args || {})]
  );
}

export async function getJob(id: string) {
  if (skipDb) {
    return mem.jobs.find((j) => j.id === id);
  }
  const r = await pool.query("SELECT * FROM jobs WHERE id=$1", [id]);
  return r.rows[0] as JobRecord | undefined;
}

export async function claimJobs(limit = 5, workerId = "worker-1") {
  if (skipDb) {
    const jobs = mem.jobs.filter((j) => j.status === "queued").slice(0, limit).map((j) => ({ id: j.id, type: j.type, args: j.args }));
    for (const j of jobs) {
      const rec = mem.jobs.find((r) => r.id === j.id);
      if (rec) { rec.status = "in_progress"; rec.worker_id = workerId; rec.updated_at = new Date().toISOString(); rec.claimed_at = new Date().toISOString(); }
    }
    return jobs;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `SELECT id, type, args FROM jobs 
       WHERE status='queued' 
       ORDER BY created_at ASC 
       FOR UPDATE SKIP LOCKED 
       LIMIT $1`,
      [limit]
    );
    const jobs = res.rows as { id: string; type: string; args: any }[];
    for (const j of jobs) {
      await client.query(
        `UPDATE jobs SET status='in_progress', claimed_at=now(), worker_id=$2, updated_at=now() WHERE id=$1`,
        [j.id, workerId]
      );
    }
    await client.query("COMMIT");
    return jobs;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateJob(
  id: string,
  update: Partial<{ status: JobRecord["status"]; progress: number; result: any }>
) {
  if (skipDb) {
    const rec = mem.jobs.find((j) => j.id === id);
    if (!rec) return;
    if (update.status) rec.status = update.status;
    if (typeof update.progress === "number") rec.progress = update.progress;
    if (update.result !== undefined) rec.result = update.result;
    rec.updated_at = new Date().toISOString();
    return;
  }
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;
  if (update.status) {
    fields.push(`status=$${idx++}`);
    values.push(update.status);
  }
  if (typeof update.progress === "number") {
    fields.push(`progress=$${idx++}`);
    values.push(update.progress);
  }
  if (update.result !== undefined) {
    fields.push(`result=$${idx++}`);
    values.push(JSON.stringify(update.result));
  }
  fields.push(`updated_at=now()`);
  const sql = `UPDATE jobs SET ${fields.join(", ")} WHERE id=$${idx}`;
  values.push(id);
  await pool.query(sql, values);
}

export async function insertSlackTask(params: {
  jobId: string;
  channelId: string;
  userId: string;
  ts: string;
  threadTs?: string | null;
  text: string;
}) {
  const { jobId, channelId, userId, ts, threadTs, text } = params;
  if (skipDb) {
    mem.slackTasks.push({ jobId, channelId, userId, ts, threadTs: threadTs || null, text });
    return;
  }
  await pool.query(
    `INSERT INTO slack_tasks(job_id, channel_id, user_id, ts, thread_ts, text)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (job_id) DO NOTHING`,
    [jobId, channelId, userId, ts, threadTs || null, text]
  );
}

export async function insertLedger(entry: { id: string; source: string; payload: unknown }) {
  if (skipDb) {
    if (!mem.ledger[entry.id]) mem.ledger[entry.id] = entry;
    return;
  }
  await pool.query(
    `INSERT INTO ledger(id, source, payload)
     VALUES ($1,$2,$3)
     ON CONFLICT (id) DO NOTHING`,
    [entry.id, entry.source, JSON.stringify(entry.payload)]
  );
}
