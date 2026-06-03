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
}
