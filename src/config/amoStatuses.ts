import { env } from "./env.js";

export const amoPipelineName = "Яхтенные экспедиции";

export const amoStatusNames = [
  "Новый лид",
  "Бот ответил",
  "Выясняем запрос",
  "Интерес есть",
  "Горячий лид",
  "Передан ассистенту",
  "Ждём предоплату",
  "Предоплата внесена",
  "Полная оплата",
  "Не отвечает",
  "Отложить",
  "Отказ"
] as const;

export const amoStatuses = {
  new: env.AMO_STATUS_NEW_ID,
  botReplied: env.AMO_STATUS_BOT_REPLIED_ID,
  clarifying: env.AMO_STATUS_CLARIFYING_ID,
  interest: env.AMO_STATUS_INTEREST_ID,
  hot: env.AMO_STATUS_HOT_ID,
  assistant: env.AMO_STATUS_ASSISTANT_ID
} as const;
