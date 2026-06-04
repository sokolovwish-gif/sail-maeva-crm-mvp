import type { MessageRecord } from "../../storage/db.js";

export function buildResponsePrompt(input: {
  messageText: string;
  history: MessageRecord[];
  knowledge: unknown;
}): string {
  return JSON.stringify({
    task: "Classify the Telegram Business message and decide if Sail Maeva may answer automatically.",
    output: {
      intent: "details | price | solo | life_on_board | seasick | safety | flights | booking_payment | contract | thinking | emotional_warm | relative_concern | date_unavailable | unknown",
      decision: "ai_auto_send | human_handoff",
      confidence: "0..1",
      riskLevel: "low | medium | high",
      clientMood: "short Russian description",
      detectedFear: "short Russian description or empty string",
      answerText: "client-facing text only when decision is ai_auto_send; otherwise empty string",
      assistantNote: "short note for assistant",
      handoffReason: "why a human must take over, or empty string",
      delaySeconds: "45..140 for ai_auto_send, 0 for human_handoff",
      shouldNotifyAssistant: "boolean",
      shouldSaveMemory: "boolean",
      forbiddenTriggered: "boolean"
    },
    hardRules: [
      "Payment, booking, contract, check/receipt, requisites, call/meeting requests, conflicts, refunds, exact availability, exact dates and exact prices must be human_handoff.",
      "If the conversation is close to a sale, use human_handoff and do not write a client-facing answer.",
      "Do not invent facts.",
      "The bot must sound like Masha, never like an AI.",
      "Return only valid JSON."
    ],
    knowledge: input.knowledge,
    history: input.history.map((item) => ({ direction: item.direction, text: item.text })),
    latestMessage: input.messageText
  });
}
