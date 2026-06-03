import { Router } from "express";
import { env } from "../config/env.js";
import { handleIncomingMessage } from "../logic/router.js";
import type { IncomingTelegramMessage, TelegramUpdate } from "./types.js";

export function createTelegramWebhookRouter(): Router {
  const router = Router();

  router.post("/webhook", async (req, res, next) => {
    try {
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const actual = req.header("x-telegram-bot-api-secret-token");
        if (actual !== env.TELEGRAM_WEBHOOK_SECRET) {
          res.status(401).json({ ok: false, error: "invalid telegram secret" });
          return;
        }
      }

      const incoming = extractIncomingMessage(req.body as TelegramUpdate);
      if (!incoming) {
        res.json({ ok: true, skipped: true });
        return;
      }

      await handleIncomingMessage(incoming, req.body as TelegramUpdate);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function extractIncomingMessage(update: TelegramUpdate): IncomingTelegramMessage | undefined {
  if (update.business_message) {
    const text = update.business_message.text ?? update.business_message.caption ?? "";
    return { kind: "business_message", message: update.business_message, text, shouldReply: Boolean(text) };
  }

  if (update.message) {
    const text = update.message.text ?? update.message.caption ?? "";
    return { kind: "message", message: update.message, text, shouldReply: Boolean(text) };
  }

  if (update.edited_business_message) {
    const text = update.edited_business_message.text ?? update.edited_business_message.caption ?? "";
    return { kind: "edited_business_message", message: update.edited_business_message, text, shouldReply: false };
  }

  return undefined;
}
