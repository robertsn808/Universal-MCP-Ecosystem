export type JobPayload = { type: string; args?: Record<string, unknown> };

// Placeholder in-memory queue; replace with Postgres/Redis/SQS
const queue: { id: string; type: string; args?: Record<string, unknown> }[] = [];

export function enqueue(job: JobPayload): string {
  const id = Math.random().toString(36).slice(2);
  queue.push({ id, ...job });
  return id;
}

export function drain(): { id: string; type: string; args?: Record<string, unknown> }[] {
  const items = queue.splice(0, queue.length);
  return items;
}

