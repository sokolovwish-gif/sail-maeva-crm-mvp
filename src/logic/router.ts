import { AmoClient } from "../amocrm/client.js";
import { createContact, findContact } from "../amocrm/contacts.js";
import { createLead, findLead, leadUrl, updateLead } from "../amocrm/leads.js";
import { addLeadNote } from "../amocrm/notes.js";
import { createLeadTask } from "../amocrm/tasks.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { scripts } from "../config/scripts.js";
import { AppDb } from "../storage/db.js";
import { TelegramSender } from "../telegram/sender.js";
import type { IncomingTelegramMessage, TelegramUpdate } from "../telegram/types.js";
import { classifyMessage } from "./classifier.js";
import { buildAssistantNotification } from "./scripts.js";

const db = new AppDb();
const amo = new AmoClient();
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

  const classification = classifyMessage(text);
  db.saveClassification({
    messageId,
    intent: classification.intent,
    isHot: classification.isHot,
    fear: classification.fear,
    destination: classification.destination,
    confidence: classification.confidence
  });

  if (classification.status) {
    db.updateConversationStatus(conversation.id, classification.status, classification.assignedTo);
  }

  const replyText = scripts[classification.intent];
  if (replyText) {
    try {
      await telegram.sendMessage({
        chatId: chat.id,
        text: replyText,
        businessConnectionId: incoming.message.business_connection_id
      });
      db.saveMessage({ conversationId: conversation.id, direction: "outbound", text: replyText });
      logger.info({
        kind: incoming.kind,
        conversationId: conversation.id,
        telegramUserId: user.telegram_user_id,
        intent: classification.intent
      }, "telegram auto-reply sent");
    } catch (error) {
      logger.error({ error: serializeError(error), conversationId: conversation.id }, "telegram auto-reply failed");
    }
  }

  let amoLeadId = conversation.amo_lead_id ?? undefined;
  let amoContactId = user.amo_contact_id ?? undefined;

  if (amo.isConfigured()) {
    try {
      const contactQuery = user.username ? `@${user.username}` : user.telegram_user_id ?? "";
      const contact = amoContactId ? { id: amoContactId } : contactQuery ? await findContact(amo, contactQuery) : undefined;
      amoContactId = contact?.id ?? (await createContact(amo, {
        name: contactName(user.first_name, user.last_name, user.username),
        username: user.username ?? undefined,
        telegramUserId: user.telegram_user_id ?? undefined,
        tags: classification.tags
      })).id;
      db.setAmoContactId(user.id, amoContactId);

      const leadQuery = user.username ? `@${user.username}` : contactName(user.first_name, user.last_name, user.telegram_user_id);
      const lead = amoLeadId ? { id: amoLeadId } : await findLead(amo, leadQuery);
      amoLeadId = lead?.id ?? (await createLead(amo, {
        name: `Telegram - ${contactName(user.first_name, user.last_name, user.username ?? user.telegram_user_id)}`,
        contactId: amoContactId,
        tags: classification.tags,
        classification
      })).id;
      db.updateConversationAmoLead(conversation.id, amoLeadId);

      await addLeadNote(amo, amoLeadId, `Telegram ${incoming.kind}\n\n${text}`);
      await updateLead(amo, amoLeadId, { tags: classification.tags, classification });
      if (classification.shouldCreateAssistantTask) await createLeadTask(amo, amoLeadId);
    } catch (error) {
      logger.error({ error: serializeError(error), conversationId: conversation.id }, "amoCRM sync failed");
    }
  }

  if (classification.shouldNotifyAssistant) {
    const assistantChatId = env.ASSISTANT_TELEGRAM_CHAT_ID ?? env.MANAGER_TELEGRAM_CHAT_ID;
    if (assistantChatId) {
      try {
        await telegram.sendMessage({
          chatId: assistantChatId,
          text: buildAssistantNotification({
            firstName: user.first_name ?? "",
            username: user.username ?? "",
            lastMessage: text,
            detectedInterest: classification.destination ?? classification.intent,
            detectedFear: classification.fear ?? "не определён",
            leadUrl: amoLeadId ? leadUrl(amoLeadId) ?? String(amoLeadId) : "amoCRM не настроена"
          })
        });
      } catch (error) {
        logger.error({ error: serializeError(error), conversationId: conversation.id }, "telegram assistant notification failed");
      }
    }
  }
}

function contactName(firstName?: string | null, lastName?: string | null, fallback?: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ") || fallback || "Telegram user";
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}
