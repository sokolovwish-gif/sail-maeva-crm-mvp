export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  business_connection_id?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  business_message?: TelegramMessage;
  edited_business_message?: TelegramMessage;
};

export type IncomingTelegramMessage = {
  kind: "message" | "business_message" | "edited_business_message";
  message: TelegramMessage;
  text: string;
  shouldReply: boolean;
};
