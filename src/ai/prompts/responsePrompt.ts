import type { MessageRecord } from "../../storage/db.js";

export function buildResponsePrompt(input: {
  messageText: string;
  history: MessageRecord[];
  knowledge: unknown;
}): string {
  return JSON.stringify({
    task: "Classify the Telegram Business message and draft a Sail Maeva reply.",
    output: {
      intent: "details | price | solo | life_on_board | seasick | safety | flights | booking_payment | contract | thinking | emotional_warm | relative_concern | date_unavailable | unknown",
      decision: "auto_send | draft_for_assistant | hold_for_human",
      confidence: "0..1",
      riskLevel: "low | medium | high",
      clientMood: "short Russian description",
      detectedFear: "short Russian description or empty string",
      answerText: "client-facing text or assistant draft",
      assistantNote: "short note for assistant",
      delaySeconds: "45..140 for auto_send, 0 for draft/hold",
      shouldNotifyAssistant: "boolean",
      shouldSaveMemory: "boolean",
      forbiddenTriggered: "boolean"
    },
    hardRules: [
      "Payment, booking, contract, requisites, conflicts, refunds, exact availability, exact dates and exact prices must not be auto-sent.",
      "Do not invent facts.",
      "Return only valid JSON."
    ],
    knowledge: input.knowledge,
    history: input.history.map((item) => ({ direction: item.direction, text: item.text })),
    latestMessage: input.messageText
  });
}

