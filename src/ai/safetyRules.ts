export type SafetyResult = {
  shouldHold: boolean;
  flags: string[];
  reason?: string;
};

const guardedPatterns: Array<{ flag: string; patterns: string[] }> = [
  {
    flag: "payment",
    patterns: ["оплат", "предоплат", "куда платить", "как платить", "реквизит", "карта", "перевести", "счет", "счёт"]
  },
  {
    flag: "contract",
    patterns: ["договор", "чек", "документ", "гарант", "расписк", "подтверждение"]
  },
  {
    flag: "booking",
    patterns: ["забронировать", "бронь", "забронить", "закрепить", "место", "беру", "я в деле"]
  },
  {
    flag: "conflict",
    patterns: ["жалоб", "претенз", "верните", "возврат", "обман", "недоволь", "плохо", "конфликт"]
  }
];

export function evaluateSafety(text: string): SafetyResult {
  const normalized = text.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const flags = guardedPatterns
    .filter((item) => item.patterns.some((pattern) => normalized.includes(pattern)))
    .map((item) => item.flag);

  return {
    shouldHold: flags.length > 0,
    flags,
    reason: flags.length ? "Сообщение касается оплаты, договора, брони, реквизитов или конфликта" : undefined
  };
}
