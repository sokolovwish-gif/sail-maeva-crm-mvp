export type AIIntent =
  | "details"
  | "price"
  | "solo"
  | "life_on_board"
  | "seasick"
  | "safety"
  | "flights"
  | "booking_payment"
  | "contract"
  | "thinking"
  | "emotional_warm"
  | "relative_concern"
  | "date_unavailable"
  | "unknown";

export type AIDecision = "scripted_auto_send" | "ai_auto_send" | "human_handoff";
export type AIRiskLevel = "low" | "medium" | "high";

export type AIResponseDecision = {
  intent: AIIntent;
  decision: AIDecision;
  confidence: number;
  riskLevel: AIRiskLevel;
  clientMood: string;
  detectedFear: string;
  answerText: string;
  assistantNote: string;
  handoffReason: string;
  matchedIntentId?: string;
  matchedVariantId?: string;
  delaySeconds: number;
  shouldNotifyAssistant: boolean;
  shouldSaveMemory: boolean;
  forbiddenTriggered: boolean;
  raw?: unknown;
};
