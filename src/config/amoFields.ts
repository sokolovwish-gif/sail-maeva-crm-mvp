export const leadFields = {
  direction: "Направление",
  departureDate: "Дата выезда",
  format: "Формат",
  city: "Город клиента",
  companions: "Едет",
  interestLevel: "Уровень интереса",
  fear: "Главный страх",
  lastQuestion: "Последний вопрос клиента",
  tourAmount: "Сумма тура",
  currency: "Валюта",
  prepayment: "Предоплата",
  balance: "Остаток",
  nextTouchDate: "Дата следующего касания",
  owner: "Кто ведёт",
  source: "Источник"
} as const;

export const leadFieldEnums = {
  direction: ["Турция", "Таиланд", "другое", "не выбрано"],
  format: ["женский", "смешанный", "приватный", "не важно", "не выбрано"],
  companions: ["одна", "с подругой", "с мужем", "парой", "неясно"],
  interestLevel: ["холодный", "тёплый", "горячий"],
  fear: ["одна", "дорого", "укачивает", "безопасность", "быт", "договор", "отпуск", "другое"],
  currency: ["EUR", "USD", "RUB", "USDT"],
  owner: ["бот", "ассистент", "Маша"],
  source: ["рилс", "сторис", "директ", "Telegram", "рекомендация", "неизвестно"]
} as const;
