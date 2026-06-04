import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { AppDb } from "../storage/db.js";
import { TelegramSender } from "../telegram/sender.js";
import type { IncomingTelegramMessage, TelegramUpdate } from "../telegram/types.js";
import { randomReplyDelayMs } from "./delayedResponses.js";

const db = new AppDb();
const telegram = new TelegramSender();

export async function handleIncomingMessage(incoming: IncomingTelegramMessage, rawUpdate: TelegramUpdate): Promise<void> {
  const from = incoming.message.from;
  const chat = incoming.message.chat;
  const text = incoming.text.trim();

  const user = db.upsertUser({
    telegramUserId: from?.id ? String(from.id) : undefined,
    username: from?.username ?? chat.username,
    firstName: from?.first_name ?? chat.first_name,
    lastName: from?.last_name ?? chat.last_name
  });

  const conversation = db.getOrCreateConversation({
    userId: user.id,
    telegramChatId: String(chat.id),
    businessConnectionId: incoming.message.business_connection_id
  });

  const messageId = db.saveMessage({
    conversationId: conversation.id,
    direction: "inbound",
    text,
    rawJson: rawUpdate
  });

  logger.info({
    kind: incoming.kind,
    conversationId: conversation.id,
    telegramUserId: user.telegram_user_id,
    telegramChatId: String(chat.id),
    hasBusinessConnection: Boolean(incoming.message.business_connection_id),
    allowedTelegramUserIdsCount: env.ALLOWED_TELEGRAM_USER_IDS.length
  }, "telegram inbound saved");

  const hasBusinessConnection = Boolean(incoming.message.business_connection_id);
  const canProcessNonBusinessMessage = env.NODE_ENV !== "production" && env.ALLOW_NON_BUSINESS_MESSAGES;
  if (!hasBusinessConnection && !canProcessNonBusinessMessage) {
    logger.info({
      kind: incoming.kind,
      conversationId: conversation.id,
      telegramUserId: user.telegram_user_id
    }, "telegram inbound skipped: missing business_connection_id");
    return;
  }

  const allowedTelegramUserIds = env.ALLOWED_TELEGRAM_USER_IDS;
  if (allowedTelegramUserIds.length > 0 && (!user.telegram_user_id || !allowedTelegramUserIds.includes(user.telegram_user_id))) {
    logger.info({
      kind: incoming.kind,
      conversationId: conversation.id,
      telegramUserId: user.telegram_user_id
    }, "telegram inbound skipped: user is not in allowlist");
    return;
  }

  if (!incoming.shouldReply || !text) {
    logger.info({
      kind: incoming.kind,
      conversationId: conversation.id,
      telegramUserId: user.telegram_user_id,
      shouldReply: incoming.shouldReply,
      hasText: Boolean(text)
    }, "telegram inbound skipped: no reply needed");
    return;
  }

  if (incoming.message.business_connection_id) {
    try {
      const businessConnection = await telegram.getBusinessConnection(incoming.message.business_connection_id);
      logger.info({
        conversationId: conversation.id,
        businessConnectionId: maskId(incoming.message.business_connection_id),
        businessConnectionUserChatId: businessConnection?.user_chat_id,
        businessConnectionIsEnabled: businessConnection?.is_enabled,
        businessConnectionCanReply: businessConnection?.can_reply ?? businessConnection?.rights?.can_reply,
        businessConnectionCanReadMessages: businessConnection?.rights?.can_read_messages
      }, "telegram business connection inspected");
    } catch (error) {
      logger.error({ error: serializeError(error), conversationId: conversation.id }, "telegram business connection inspection failed");
    }
  }

  const delayMs = env.AI_DRAFT_ONLY || !env.AI_AUTO_SEND_ENABLED ? 0 : randomReplyDelayMs();
  const jobId = db.enqueueDelayedResponse({
    messageId,
    conversationId: conversation.id,
    dueAt: new Date(Date.now() + delayMs)
  });
  db.updateConversationStatus(conversation.id, "AI queued", "бот");

  logger.info({
    jobId,
    conversationId: conversation.id,
    delaySeconds: Math.round(delayMs / 1000)
  }, "AI delayed response queued");
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}

function maskId(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
