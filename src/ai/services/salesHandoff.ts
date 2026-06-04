import type { AIIntent } from "../types.js";

const salesPatterns: Array<{ intent: AIIntent; reason: string; pattern: RegExp }> = [
  { intent: "booking_payment", reason: "вопрос про оплату", pattern: /оплат|платить|предоплат|перевод|реквизит|карта|сч[её]т/i },
  { intent: "booking_payment", reason: "вопрос про бронь", pattern: /брон|забронировать|место за мной|закрепить/i },
  { intent: "contract", reason: "вопрос про договор или чек", pattern: /договор|чек|акт|оферт|юрид/i },
  { intent: "date_unavailable", reason: "вопрос про точное наличие мест", pattern: /есть места|наличие|свободн|точно есть|сколько мест/i },
  { intent: "price", reason: "вопрос про точную цену", pattern: /точн.*цен|точн.*стоим|сколько стоит|цена|стоимость|прайс/i },
  { intent: "unknown", reason: "просьба о встрече или созвоне", pattern: /созвон|созвониться|встреч|позвон|номер телефона|телефон/i },
  { intent: "unknown", reason: "конфликтная или чувствительная тема", pattern: /конфликт|жалоб|возврат|вернуть деньги|претензи/i }
];

export function detectSalesHandoff(text: string): { intent: AIIntent; reason: string } | undefined {
  const match = salesPatterns.find((item) => item.pattern.test(text));
  return match ? { intent: match.intent, reason: match.reason } : undefined;
}

