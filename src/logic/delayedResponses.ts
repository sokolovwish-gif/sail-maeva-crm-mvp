import { generateAIResponse } from "../ai/services/aiResponder.js";
import type { AIResponseDecision } from "../ai/types.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { AppDb, type DelayedResponseRecord } from "../storage/db.js";
import { TelegramSender } from "../telegram/sender.js";

const db = new AppDb();
const telegram = new TelegramSender();

let workerStarted = false;

export function randomReplyDelayMs(): number {
  const min = Math.max(0, env.MIN_REPLY_DELAY_SECONDS);
  const max = Math.max(min, env.MAX_REPLY_DELAY_SECONDS);
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

    const decision = await generateAIResponse(message.text, history);

    db.saveAiDecision({
      messageId: message.id,
      conversationId: conversation.id,
      mode: decision.decision,
      decision: decision.decision,
      intent: decision.intent,
      confidence: decision.confidence,
      riskLevel: decision.riskLevel,
      clientMood: decision.clientMood,
      detectedFear: decision.detectedFear,
      riskFlags: decision.forbiddenTriggered ? ["forbidden"] : [],
      reason: decision.assistantNote,
      answerText: decision.answerText,
      assistantNote: decision.assistantNote,
      forbiddenTriggered: decision.forbiddenTriggered,
      draftText: decision.decision === "draft_for_assistant" ? decision.answerText : undefined,
      finalText: decision.decision === "auto_send" ? decision.answerText : undefined,
      model: env.OPENAI_MODEL,
      rawJson: decision.raw
    });

    if (decision.decision === "auto_send" && decision.answerText) {
      await telegram.sendMessage({
        chatId: conversation.telegram_chat_id,
        text: decision.answerText,
        businessConnectionId: conversation.business_connection_id ?? undefined
      });
      db.saveMessage({ conversationId: conversation.id, direction: "outbound", text: decision.answerText });
      logger.info({ jobId: job.id, conversationId: conversation.id, intent: decision.intent }, "AI auto-reply sent");
    } else {
      await notifyAssistant(message.text, decision);
      logger.info({ jobId: job.id, conversationId: conversation.id, mode: decision.decision, intent: decision.intent }, "AI decision sent to assistant");
    }

    db.markDelayedResponseDone(job.id);
  } catch (error) {
    db.markDelayedResponseFailed(job.id, error instanceof Error ? error.message : String(error));
    logger.error({ error: serializeError(error), jobId: job.id }, "delayed response job failed");
  }
}

async function notifyAssistant(lastMessage: string, decision: AIResponseDecision): Promise<void> {
  const assistantChatId = env.ASSISTANT_TELEGRAM_CHAT_ID ?? env.MANAGER_TELEGRAM_CHAT_ID;
  if (!assistantChatId) return;

  const text = decision.decision === "hold_for_human"
    ? [
        "Нужен человек Sail Maeva",
        "",
        "Сообщение клиента:",
        lastMessage,
        "",
        `Причина: ${decision.intent}`,
        `Риск: ${decision.riskLevel}`,
        "Заметка:",
        decision.assistantNote,
        "",
        "Бот молчит, чтобы не испортить продажу."
      ].join("\n")
    : [
        "Черновик ответа Sail Maeva",
        "",
        "Сообщение клиента:",
        lastMessage,
        "",
        `Решение ИИ: ${decision.decision}`,
        `Интент: ${decision.intent}`,
        `Риск: ${decision.riskLevel}`,
        `Уверенность: ${decision.confidence}`,
        "",
        "Черновик:",
        decision.answerText,
        "",
        "Заметка:",
        decision.assistantNote,
        "",
        "Важно: клиенту пока ничего не отправлено."
      ].join("\n");

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
