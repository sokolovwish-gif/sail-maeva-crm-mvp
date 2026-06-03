import { env } from "../config/env.js";

type SendMessageInput = {
  chatId: string | number;
  text: string;
  businessConnectionId?: string;
};

export class TelegramSender {
  constructor(private readonly token = env.TELEGRAM_BOT_TOKEN) {}

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
