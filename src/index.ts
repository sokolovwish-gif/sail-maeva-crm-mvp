import express from "express";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { createTelegramWebhookRouter } from "./telegram/webhook.js";
import { startDelayedResponseWorker } from "./logic/delayedResponses.js";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sail-maeva-crm-mvp" });
});

app.use("/telegram", createTelegramWebhookRouter());

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: serializeError(error) }, "request failed");
  res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "unknown error" });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Sail Maeva MVP server started");
  startDelayedResponseWorker();
});

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}
