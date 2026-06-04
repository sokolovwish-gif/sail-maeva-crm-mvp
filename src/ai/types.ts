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

export type AIDecision = "auto_send" | "draft_for_assistant" | "hold_for_human";
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
  delaySeconds: number;
  shouldNotifyAssistant: boolean;
  shouldSaveMemory: boolean;
  forbiddenTriggered: boolean;
  raw?: unknown;
};

