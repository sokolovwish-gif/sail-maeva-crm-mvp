import "dotenv/config";
import { env } from "../src/config/env.js";

if (!env.TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is missing in .env");
  process.exit(1);
}

if (!env.PUBLIC_WEBHOOK_URL) {
  console.error("PUBLIC_WEBHOOK_URL is missing in .env");
  process.exit(1);
}

const webhookUrl = new URL("/telegram/webhook", env.PUBLIC_WEBHOOK_URL).toString();

const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ["business_message", "edited_business_message", "message"]
  })
});

const body = await response.json();

if (!response.ok || !body.ok) {
  console.error("Telegram setWebhook failed:");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`Telegram webhook installed: ${webhookUrl}`);
