import { App, LogLevel } from "@slack/bolt";
import axios from "axios";

const token = process.env.SLACK_BOT_TOKEN || "";
const signingSecret = process.env.SLACK_SIGNING_SECRET || "";
const apiBase = process.env.API_BASE_URL || "http://api-backend:8080";

const app = new App({
  token,
  signingSecret,
  logLevel: LogLevel.INFO,
  // For Events API on Render: provide a public endpoint via ExpressReceiver if needed
});

async function reply(ack: any, say: any, text: string) {
  await ack();
  await say(text);
}

app.command("/aliifm", async ({ command, ack, say }) => {
  const text = command.text?.trim() || "";
  const args = text.split(" ").filter(Boolean);
  const sub = args.shift() || "help";

  try {
    switch (sub) {
      case "deploy": {
        await reply(ack, say, "Deploy requested. Triggering Render pipelines…");
        // TODO: call CI or Render API; post logs URL
        break;
      }
      case "mirror": {
        const url = args[0] || "https://aliifishmarket.com";
        const res = await axios.post(`${apiBase}/mirror`, { url });
        await reply(
          ack,
          say,
          `Mirror job accepted. Job ID: ${res.data.id} for ${url}`
        );
        break;
      }
      case "video": {
        // /aliifm video make --sku=ID --count=10 --style=vertical --duration=15s
        await reply(
          ack,
          say,
          "Video generation requested. Worker will post artifacts when ready."
        );
        // TODO: enqueue with parsed flags
        break;
      }
      case "invoice": {
        // /aliifm invoice create --customer= --items=
        await reply(
          ack,
          say,
          "Invoice creation requested via UPP. Returning pay link when ready."
        );
        // TODO: call API which uses UPP client
        break;
      }
      case "task": {
        const id = args[1];
        if (!id) {
          await reply(ack, say, "Usage: /aliifm task status <id>");
          return;
        }
        const res = await axios.get(`${apiBase}/tasks/${id}`);
        await reply(
          ack,
          say,
          `Task ${id}: ${res.data.status} (${res.data.progress}%)`
        );
        break;
      }
      case "pos": {
        await reply(
          ack,
          say,
          "POS migration plan will be posted as a thread shortly."
        );
        // TODO: generate plan text and post
        break;
      }
      default: {
        await reply(
          ack,
          say,
          "Commands: deploy | mirror [url] | video make … | invoice create … | task status <id> | pos plan"
        );
      }
    }
  } catch (err: any) {
    console.error("SLACK_CMD_ERROR", err?.message || err);
    await ack();
    await say("Error handling command. Please check logs.");
  }
});

// Listen to mentions in channels
app.event("app_mention", async ({ event, client, say }) => {
  const text = event.text || "";
  const channel = event.channel;
  const user = event.user as string;
  const ts = event.ts as string;
  const thread_ts = (event as any).thread_ts as string | undefined;
  // Enqueue a general agent task
  const res = await axios.post(`${apiBase}/enqueue`, {
    type: "agent.task",
    args: {
      text,
      slack: { channel, user, ts, thread_ts, text },
    },
  });
  const jobId = res.data.id;
  await say({
    text: `Got it <@${user}> — working on it. Task ID: ${jobId}`,
    thread_ts: thread_ts || ts,
  });
});

// Listen to direct messages to the bot
app.message(async ({ message, client, say }) => {
  const msg = message as any;
  if (msg.channel_type !== "im") return; // only handle DMs here
  const text = msg.text || "";
  const channel = msg.channel as string;
  const user = msg.user as string;
  const ts = msg.ts as string;
  const res = await axios.post(`${apiBase}/enqueue`, {
    type: "agent.task",
    args: {
      text,
      slack: { channel, user, ts, text },
    },
  });
  const jobId = res.data.id;
  await say({ text: `Acknowledged. Task ID: ${jobId}` });
});

(async () => {
  const port = Number(process.env.PORT || 3001);
  await app.start(port);
  console.log(`slack-bot listening on :${port}`);
})();
