import { env } from "../config/env.js";

type SendMessageInput = {
  chatId: string | number;
  text: string;
  businessConnectionId?: string;
};

export type TelegramBusinessConnection = {
  id: string;
  is_enabled?: boolean;
  can_reply?: boolean;
  user_chat_id?: number;
  rights?: {
    can_reply?: boolean;
    can_read_messages?: boolean;
    can_delete_sent_messages?: boolean;
    can_delete_all_messages?: boolean;
    can_edit_name?: boolean;
    can_edit_bio?: boolean;
    can_edit_profile_photo?: boolean;
    can_edit_username?: boolean;
    can_change_gift_settings?: boolean;
    can_view_gifts_and_stars?: boolean;
    can_convert_gifts_to_stars?: boolean;
    can_transfer_and_upgrade_gifts?: boolean;
    can_transfer_stars?: boolean;
    can_manage_stories?: boolean;
  };
};

export class TelegramSender {
  constructor(private readonly token = env.TELEGRAM_BOT_TOKEN) {}

  async getBusinessConnection(businessConnectionId: string): Promise<TelegramBusinessConnection | undefined> {
    if (!this.token) return undefined;

    const response = await fetch(`https://api.telegram.org/bot${this.token}/getBusinessConnection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ business_connection_id: businessConnectionId })
    });

    const body = await response.json() as { ok: boolean; result?: TelegramBusinessConnection; description?: string };

    if (!response.ok || !body.ok) {
      throw new Error(`Telegram getBusinessConnection failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return body.result;
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    if (!this.token) return;

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
        business_connection_id: input.businessConnectionId
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
    }
  }
}
