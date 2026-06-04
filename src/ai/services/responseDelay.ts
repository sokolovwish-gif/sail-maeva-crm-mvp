import { env } from "../../config/env.js";
import type { AIDecision, AIIntent } from "../types.js";

export function getDelaySeconds(decision: AIDecision, intent: AIIntent, messageLength: number): number {
  if (decision !== "auto_send") return 0;

  const min = Math.max(0, env.MIN_REPLY_DELAY_SECONDS);
  const max = Math.max(min, env.MAX_REPLY_DELAY_SECONDS);
  const longMessage = messageLength > 220;
  const baseMin = longMessage ? Math.max(min, 90) : min;
  const baseMax = intent === "details" || intent === "price" || intent === "solo"
    ? Math.min(max, longMessage ? 140 : 90)
    : max;

  return baseMin + Math.floor(Math.random() * (Math.max(baseMin, baseMax) - baseMin + 1));
}

