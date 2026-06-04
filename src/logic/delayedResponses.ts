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

    if (db.hasNewerInboundMessage(conversation.id, message.id)) {
      db.markDelayedResponseDone(job.id);
      logger.info({ jobId: job.id, conversationId: conversation.id }, "delayed response skipped: newer inbound message exists");
      return;
    }

    const forceHumanHandoffReason = conversation.status === "human_handoff" || conversation.status === "assistant_active"
      ? `Диалог уже в ручном режиме: ${conversation.status}`
      : undefined;

    const lastVariantId = db.getLastScriptedVariant(conversation.id);
    const decision = await generateAIResponse(message.text, history, { lastVariantId, forceHumanHandoffReason });

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
      draftText: undefined,
      finalText: decision.decision === "scripted_auto_send" || decision.decision === "ai_auto_send" ? decision.answerText : undefined,
      model: env.OPENAI_MODEL,
      rawJson: decision.raw
    });

    if ((decision.decision === "scripted_auto_send" || decision.decision === "ai_auto_send") && decision.answerText) {
      await telegram.sendMessage({
        chatId: conversation.telegram_chat_id,
        text: decision.answerText,
        businessConnectionId: conversation.business_connection_id ?? undefined
      });
      db.saveMessage({ conversationId: conversation.id, direction: "outbound", text: decision.answerText });
      db.saveScriptedResponseLog({
        conversationId: conversation.id,
        messageId: message.id,
        matchedIntent: decision.matchedIntentId ?? decision.intent,
        matchedVariantId: decision.matchedVariantId,
        mode: decision.decision,
        delaySeconds: decision.delaySeconds,
        wasSent: true
      });
      logger.info({ jobId: job.id, conversationId: conversation.id, intent: decision.intent }, "AI auto-reply sent");
    } else if (decision.decision === "human_handoff") {
      await notifyAssistant(message.text, decision);
      db.updateConversationStatus(conversation.id, "human_handoff", "assistant");
      db.saveScriptedResponseLog({
        conversationId: conversation.id,
        messageId: message.id,
        matchedIntent: decision.matchedIntentId ?? decision.intent,
        matchedVariantId: decision.matchedVariantId,
        mode: decision.decision,
        delaySeconds: 0,
        wasSent: false,
        handoffReason: decision.handoffReason || decision.assistantNote
      });
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

  const text = [
        "Нужен человек Sail Maeva",
        "",
        "Сообщение клиента:",
        lastMessage,
        "",
        `Причина передачи: ${decision.handoffReason || decision.assistantNote}`,
        `Интент: ${decision.intent}`,
        `Риск: ${decision.riskLevel}`,
        `Уверенность: ${decision.confidence}`,
        "",
        "Бот молчит и клиенту ничего не отправлено."
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
