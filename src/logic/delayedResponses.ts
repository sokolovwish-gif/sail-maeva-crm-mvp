import { decideAiReply, type AiDecision } from "../ai/assistant.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { AppDb, type DelayedResponseRecord } from "../storage/db.js";
import { TelegramSender } from "../telegram/sender.js";
import { buildAssistantNotification } from "./scripts.js";

const db = new AppDb();
const telegram = new TelegramSender();

let workerStarted = false;

export function randomReplyDelayMs(): number {
  const min = Math.max(0, env.AI_REPLY_DELAY_MIN_SECONDS);
  const max = Math.max(min, env.AI_REPLY_DELAY_MAX_SECONDS);
  const seconds = min + Math.floor(Math.random() * (max - min + 1));
  return seconds * 1000;
}

export function startDelayedResponseWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  setInterval(() => {
    processDueResponses().catch((error) => {
      logger.error({ error: serializeError(error) }, "delayed response worker failed");
    });
  }, 5000).unref();

  logger.info("delayed response worker started");
}

async function processDueResponses(): Promise<void> {
  const jobs = db.getDueDelayedResponses(5);
  for (const job of jobs) {
    await processJob(job);
  }
}

async function processJob(job: DelayedResponseRecord): Promise<void> {
  db.markDelayedResponseProcessing(job.id);

  try {
    const message = db.getMessage(job.message_id);
    const conversation = db.getConversation(job.conversation_id);
    const history = db.getRecentMessages(job.conversation_id, 10);

    const decision = await decideAiReply({
      messageText: message.text,
      history
    });

    db.saveAiDecision({
      messageId: message.id,
      conversationId: conversation.id,
      mode: decision.mode,
      intent: decision.intent,
      confidence: decision.confidence,
      riskFlags: decision.riskFlags,
      reason: decision.reason,
      draftText: decision.draftText,
      finalText: decision.finalText,
      model: env.OPENAI_MODEL,
      rawJson: decision.raw
    });

    if (decision.mode === "auto_send" && decision.finalText) {
      await telegram.sendMessage({
        chatId: conversation.telegram_chat_id,
        text: decision.finalText,
        businessConnectionId: conversation.business_connection_id ?? undefined
      });
      db.saveMessage({ conversationId: conversation.id, direction: "outbound", text: decision.finalText });
      logger.info({ jobId: job.id, conversationId: conversation.id, intent: decision.intent }, "AI auto-reply sent");
    } else {
      await notifyAssistant(conversation, message.text, decision);
      logger.info({ jobId: job.id, conversationId: conversation.id, mode: decision.mode, intent: decision.intent }, "AI decision sent to assistant");
    }

    db.markDelayedResponseDone(job.id);
  } catch (error) {
    db.markDelayedResponseFailed(job.id, error instanceof Error ? error.message : String(error));
    logger.error({ error: serializeError(error), jobId: job.id }, "delayed response job failed");
  }
}

async function notifyAssistant(
  conversation: { id: number; telegram_chat_id: string; business_connection_id: string | null },
  lastMessage: string,
  decision: AiDecision
): Promise<void> {
  const assistantChatId = env.ASSISTANT_TELEGRAM_CHAT_ID ?? env.MANAGER_TELEGRAM_CHAT_ID;
  if (!assistantChatId) return;

  const text = buildAssistantNotification({
    firstName: "",
    username: "",
    lastMessage,
    detectedInterest: decision.intent,
    detectedFear: decision.riskFlags.length ? decision.riskFlags.join(", ") : "не определён",
    leadUrl: `AI mode: ${decision.mode}\nПричина: ${decision.reason}${decision.draftText ? `\n\nЧерновик:\n${decision.draftText}` : ""}`
  });

  await telegram.sendMessage({
    chatId: assistantChatId,
    text
  });
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}
