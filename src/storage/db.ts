import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { schemaSql } from "./schema.js";

export type UserRecord = {
  id: number;
  telegram_user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  amo_contact_id: number | null;
};

export type ConversationRecord = {
  id: number;
  user_id: number;
  telegram_chat_id: string;
  business_connection_id: string | null;
  amo_lead_id: number | null;
  status: string;
  assigned_to: string;
};

export type MessageRecord = {
  id: number;
  conversation_id: number;
  direction: "inbound" | "outbound";
  text: string;
  raw_json: string | null;
  created_at: string;
};

export type DelayedResponseRecord = {
  id: number;
  message_id: number;
  conversation_id: number;
  due_at: string;
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  last_error: string | null;
};

export type AiDecisionInput = {
  messageId: number;
  conversationId: number;
  mode: "scripted_auto_send" | "ai_auto_send" | "human_handoff";
  decision?: "scripted_auto_send" | "ai_auto_send" | "human_handoff";
  intent: string;
  confidence: number;
  riskLevel?: string;
  clientMood?: string;
  detectedFear?: string;
  riskFlags: string[];
  reason: string;
  answerText?: string;
  assistantNote?: string;
  forbiddenTriggered?: boolean;
  draftText?: string;
  finalText?: string;
  model?: string;
  rawJson?: unknown;
};

export type ScriptedResponseLogInput = {
  conversationId: number;
  messageId: number;
  matchedIntent: string;
  matchedVariantId?: string;
  mode: "scripted_auto_send" | "ai_auto_send" | "human_handoff";
  delaySeconds: number;
  wasSent: boolean;
  handoffReason?: string;
};

export type UpsertUserInput = {
  telegramUserId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export class AppDb {
  private readonly db: Database.Database;

  constructor(filePath = env.DATABASE_PATH) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(schemaSql);
    this.ensureAiDecisionColumns();
    this.ensureScriptedResponseLogsTable();
  }

  upsertUser(input: UpsertUserInput): UserRecord {
    const existing = this.findUser(input);
    if (existing) {
      this.db.prepare(`
        UPDATE users
        SET telegram_user_id = COALESCE(@telegramUserId, telegram_user_id),
            username = COALESCE(@username, username),
            first_name = COALESCE(@firstName, first_name),
            last_name = COALESCE(@lastName, last_name),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({ ...input, id: existing.id });
      return this.getUser(existing.id);
    }

    const result = this.db.prepare(`
      INSERT INTO users (telegram_user_id, username, first_name, last_name)
      VALUES (@telegramUserId, @username, @firstName, @lastName)
    `).run(input);
    return this.getUser(Number(result.lastInsertRowid));
  }

  findUser(input: Pick<UpsertUserInput, "telegramUserId" | "username">): UserRecord | undefined {
    if (input.telegramUserId) {
      const user = this.db.prepare("SELECT * FROM users WHERE telegram_user_id = ?").get(input.telegramUserId) as UserRecord | undefined;
      if (user) return user;
    }
    if (input.username) {
      return this.db.prepare("SELECT * FROM users WHERE username = ?").get(input.username) as UserRecord | undefined;
    }
    return undefined;
  }

  getUser(id: number): UserRecord {
    const user = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRecord | undefined;
    if (!user) throw new Error(`User ${id} was not found after write`);
    return user;
  }

  setAmoContactId(userId: number, amoContactId: number): void {
    this.db.prepare("UPDATE users SET amo_contact_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amoContactId, userId);
  }

  getOrCreateConversation(input: {
    userId: number;
    telegramChatId: string;
    businessConnectionId?: string;
  }): ConversationRecord {
    const existing = this.db.prepare(`
      SELECT * FROM conversations
      WHERE user_id = @userId
        AND telegram_chat_id = @telegramChatId
        AND COALESCE(business_connection_id, '') = COALESCE(@businessConnectionId, '')
      ORDER BY id DESC
      LIMIT 1
    `).get(input) as ConversationRecord | undefined;

    if (existing) return existing;

    const result = this.db.prepare(`
      INSERT INTO conversations (user_id, telegram_chat_id, business_connection_id)
      VALUES (@userId, @telegramChatId, @businessConnectionId)
    `).run(input);
    return this.getConversation(Number(result.lastInsertRowid));
  }

  getConversation(id: number): ConversationRecord {
    const conversation = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRecord | undefined;
    if (!conversation) throw new Error(`Conversation ${id} was not found after write`);
    return conversation;
  }

  updateConversationAmoLead(conversationId: number, amoLeadId: number): void {
    this.db.prepare("UPDATE conversations SET amo_lead_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amoLeadId, conversationId);
  }

  updateConversationStatus(conversationId: number, status: string, assignedTo?: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET status = @status,
          assigned_to = COALESCE(@assignedTo, assigned_to),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @conversationId
    `).run({ conversationId, status, assignedTo });
  }

  saveMessage(input: { conversationId: number; direction: "inbound" | "outbound"; text: string; rawJson?: unknown }): number {
    const result = this.db.prepare(`
      INSERT INTO messages (conversation_id, direction, text, raw_json)
      VALUES (@conversationId, @direction, @text, @rawJson)
    `).run({
      ...input,
      rawJson: input.rawJson ? JSON.stringify(input.rawJson) : null
    });
    return Number(result.lastInsertRowid);
  }

  saveClassification(input: {
    messageId: number;
    intent: string;
    isHot: boolean;
    fear?: string;
    destination?: string;
    confidence: number;
  }): void {
    this.db.prepare(`
      INSERT INTO classifications (message_id, intent, is_hot, fear, destination, confidence)
      VALUES (@messageId, @intent, @isHot, @fear, @destination, @confidence)
    `).run({ ...input, isHot: input.isHot ? 1 : 0 });
  }

  enqueueDelayedResponse(input: { messageId: number; conversationId: number; dueAt: Date }): number {
    const result = this.db.prepare(`
      INSERT INTO delayed_responses (message_id, conversation_id, due_at)
      VALUES (@messageId, @conversationId, @dueAt)
    `).run({
      messageId: input.messageId,
      conversationId: input.conversationId,
      dueAt: input.dueAt.toISOString()
    });
    return Number(result.lastInsertRowid);
  }

  supersedePendingDelayedResponses(conversationId: number): void {
    this.db.prepare(`
      UPDATE delayed_responses
      SET status = 'failed',
          last_error = 'superseded_by_new_inbound_message',
          updated_at = CURRENT_TIMESTAMP
      WHERE conversation_id = ?
        AND status = 'pending'
    `).run(conversationId);
  }

  getDueDelayedResponses(limit = 10): DelayedResponseRecord[] {
    return this.db.prepare(`
      SELECT * FROM delayed_responses
      WHERE status = 'pending'
        AND due_at <= @now
      ORDER BY due_at ASC
      LIMIT @limit
    `).all({ now: new Date().toISOString(), limit }) as DelayedResponseRecord[];
  }

  markDelayedResponseProcessing(id: number): void {
    this.db.prepare(`
      UPDATE delayed_responses
      SET status = 'processing',
          attempts = attempts + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }

  markDelayedResponseDone(id: number): void {
    this.db.prepare(`
      UPDATE delayed_responses
      SET status = 'done',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }

  markDelayedResponseFailed(id: number, error: string): void {
    this.db.prepare(`
      UPDATE delayed_responses
      SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
          due_at = @dueAt,
          last_error = @error,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id,
      error,
      dueAt: new Date(Date.now() + 60_000).toISOString()
    });
  }

  getMessage(id: number): MessageRecord {
    const message = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRecord | undefined;
    if (!message) throw new Error(`Message ${id} was not found`);
    return message;
  }

  getRecentMessages(conversationId: number, limit = 8): MessageRecord[] {
    return this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(conversationId, limit).reverse() as MessageRecord[];
  }

  hasNewerInboundMessage(conversationId: number, messageId: number): boolean {
    const row = this.db.prepare(`
      SELECT 1
      FROM messages
      WHERE conversation_id = @conversationId
        AND direction = 'inbound'
        AND id > @messageId
      LIMIT 1
    `).get({ conversationId, messageId }) as { 1: number } | undefined;
    return Boolean(row);
  }

  getLastScriptedVariant(conversationId: number): string | undefined {
    const row = this.db.prepare(`
      SELECT matched_variant_id
      FROM scripted_response_logs
      WHERE conversation_id = @conversationId
        AND matched_variant_id IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
    `).get({ conversationId }) as { matched_variant_id: string | null } | undefined;
    return row?.matched_variant_id ?? undefined;
  }

  saveScriptedResponseLog(input: ScriptedResponseLogInput): number {
    const result = this.db.prepare(`
      INSERT INTO scripted_response_logs (
        conversation_id,
        message_id,
        matched_intent,
        matched_variant_id,
        mode,
        delay_seconds,
        was_sent,
        handoff_reason
      )
      VALUES (
        @conversationId,
        @messageId,
        @matchedIntent,
        @matchedVariantId,
        @mode,
        @delaySeconds,
        @wasSent,
        @handoffReason
      )
    `).run({
      ...input,
      wasSent: input.wasSent ? 1 : 0
    });
    return Number(result.lastInsertRowid);
  }

  saveAiDecision(input: AiDecisionInput): number {
    const result = this.db.prepare(`
      INSERT INTO ai_decisions (
        message_id,
        conversation_id,
        mode,
        decision,
        intent,
        confidence,
        risk_level,
        client_mood,
        detected_fear,
        risk_flags,
        reason,
        answer_text,
        assistant_note,
        forbidden_triggered,
        draft_text,
        final_text,
        model,
        raw_ai_json,
        raw_json
      )
      VALUES (
        @messageId,
        @conversationId,
        @mode,
        @decision,
        @intent,
        @confidence,
        @riskLevel,
        @clientMood,
        @detectedFear,
        @riskFlags,
        @reason,
        @answerText,
        @assistantNote,
        @forbiddenTriggered,
        @draftText,
        @finalText,
        @model,
        @rawJson,
        @rawJson
      )
    `).run({
      ...input,
      decision: input.decision ?? input.mode,
      riskFlags: JSON.stringify(input.riskFlags),
      forbiddenTriggered: input.forbiddenTriggered ? 1 : 0,
      rawJson: input.rawJson ? JSON.stringify(input.rawJson) : null
    });
    return Number(result.lastInsertRowid);
  }

  private ensureAiDecisionColumns(): void {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(ai_decisions)").all() as Array<{ name: string }>).map((column) => column.name)
    );
    const missingColumns: Array<[string, string]> = [
      ["decision", "TEXT"],
      ["risk_level", "TEXT"],
      ["client_mood", "TEXT"],
      ["detected_fear", "TEXT"],
      ["answer_text", "TEXT"],
      ["assistant_note", "TEXT"],
      ["forbidden_triggered", "INTEGER NOT NULL DEFAULT 0"],
      ["raw_ai_json", "TEXT"]
    ];

    for (const [name, type] of missingColumns) {
      if (!columns.has(name)) {
        this.db.exec(`ALTER TABLE ai_decisions ADD COLUMN ${name} ${type}`);
      }
    }
  }

  private ensureScriptedResponseLogsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scripted_response_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        matched_intent TEXT NOT NULL,
        matched_variant_id TEXT,
        mode TEXT NOT NULL,
        delay_seconds INTEGER NOT NULL DEFAULT 0,
        was_sent INTEGER NOT NULL DEFAULT 0,
        handoff_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}
