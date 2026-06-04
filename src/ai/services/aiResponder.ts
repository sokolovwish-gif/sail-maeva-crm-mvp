import { env } from "../../config/env.js";
import type { MessageRecord } from "../../storage/db.js";
import type { AIResponseDecision } from "../types.js";
import { classifyWithAI } from "./aiClassifier.js";
import { applySafetyDecision } from "./safetyChecker.js";

export async function generateAIResponse(input: string, context: MessageRecord[]): Promise<AIResponseDecision> {
  const classified = await classifyWithAI(input, context);
  const checked = applySafetyDecision(classified);

  if (env.AI_DRAFT_ONLY) {
    return {
      ...checked,
      decision: checked.decision === "hold_for_human" ? "hold_for_human" : "draft_for_assistant",
      shouldNotifyAssistant: true,
      delaySeconds: 0,
      assistantNote: `${checked.assistantNote}\nDraft-only режим: клиенту ничего не отправлено.`
    };
  }

  if (
    checked.decision === "auto_send" &&
    (!env.AI_AUTO_SEND_ENABLED ||
      checked.riskLevel !== "low" ||
      checked.confidence < env.AUTO_SEND_CONFIDENCE_THRESHOLD ||
      checked.forbiddenTriggered)
  ) {
    return {
      ...checked,
      decision: "draft_for_assistant",
      shouldNotifyAssistant: true,
      delaySeconds: 0,
      assistantNote: `${checked.assistantNote}\nАвтоотправка не прошла пороги безопасности.`
    };
  }

  return checked;
}

