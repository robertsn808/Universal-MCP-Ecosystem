export type Intent =
  | { type: "mirror"; args: { url: string } }
  | { type: "video.make"; args: { sku?: string; count?: number; style?: string; duration?: string; provider?: "runway" | "luma" | "pika" } }
  | { type: "invoice.create"; args: { customerEmail?: string; items?: string } }
  | { type: "pos.plan"; args: {} }
  | { type: "deploy"; args: {} }
  | { type: "task.status"; args: { id?: string } }
  | { type: "agent.task"; args: { text: string } };

const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const urlRe = /(https?:\/\/[^\s]+)/i;

function parseFlags(text: string) {
  const flags: Record<string, string> = {};
  const re = /--([a-zA-Z0-9_-]+)=([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) flags[m[1]] = m[2];
  return flags;
}

export function routeIntent(text: string): Intent {
  const t = text.toLowerCase();
  const flags = parseFlags(text);

  if (t.includes("task status") || t.startsWith("status")) {
    const parts = text.trim().split(/\s+/);
    const id = parts[parts.length - 1];
    return { type: "task.status", args: { id } };
  }

  if (t.includes("deploy")) return { type: "deploy", args: {} };

  if (t.includes("pos") && (t.includes("plan") || t.includes("toast"))) {
    return { type: "pos.plan", args: {} };
  }

  if (t.includes("mirror")) {
    const url = flags["url"] || (text.match(urlRe)?.[1] ?? "https://aliifishmarket.com");
    return { type: "mirror", args: { url } };
  }

  if (t.includes("video") || t.includes("clip")) {
    const count = flags["count"] ? Number(flags["count"]) : undefined;
    const style = flags["style"];
    const duration = flags["duration"];
    const sku = flags["sku"];
    const provider = (flags["provider"] as any) as "runway" | "luma" | "pika" | undefined;
    return { type: "video.make", args: { sku, count, style, duration, provider } };
  }

  if (t.includes("invoice") || t.includes("charge") || t.includes("bill")) {
    const customerEmail = text.match(emailRe)?.[0];
    const items = flags["items"];
    return { type: "invoice.create", args: { customerEmail, items } };
  }

  return { type: "agent.task", args: { text } };
}
