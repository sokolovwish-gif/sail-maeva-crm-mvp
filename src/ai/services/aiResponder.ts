import { env } from "../../config/env.js";
import type { MessageRecord } from "../../storage/db.js";
import type { AIResponseDecision } from "../types.js";
import { classifyWithAI } from "./aiClassifier.js";
import { detectSalesHandoff } from "./salesHandoff.js";
import { findScriptedResponse } from "./scriptedResponder.js";
import { applySafetyDecision } from "./safetyChecker.js";

export async function generateAIResponse(
  input: string,
  context: MessageRecord[],
  options: { lastVariantId?: string; forceHumanHandoffReason?: string } = {}
): Promise<AIResponseDecision> {
  if (options.forceHumanHandoffReason) {
    return {
      intent: "unknown",
      decision: "human_handoff",
      confidence: 1,
      riskLevel: "high",
      clientMood: "",
      detectedFear: "",
      answerText: "",
      assistantNote: `Бот молчит. Причина передачи: ${options.forceHumanHandoffReason}`,
      handoffReason: options.forceHumanHandoffReason,
      delaySeconds: 0,
      shouldNotifyAssistant: true,
      shouldSaveMemory: false,
      forbiddenTriggered: true
    };
  }

  const sales = detectSalesHandoff(input);
  if (sales && env.HUMAN_HANDOFF_ON_SALES) {
    return {
      intent: sales.intent,
      decision: "human_handoff",
      confidence: 1,
      riskLevel: "high",
      clientMood: "",
      detectedFear: "",
      answerText: "",
      assistantNote: `Бот молчит. Причина передачи: ${sales.reason}`,
      handoffReason: sales.reason,
      delaySeconds: 0,
      shouldNotifyAssistant: true,
      shouldSaveMemory: false,
      forbiddenTriggered: true
    };
  }

  const scripted = findScriptedResponse(input, { lastVariantId: options.lastVariantId });
  if (scripted) return scripted;

  return applySafetyDecision(await classifyWithAI(input, context));
}
