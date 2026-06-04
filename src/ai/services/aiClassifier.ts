import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { MessageRecord } from "../../storage/db.js";
import { buildResponsePrompt } from "../prompts/responsePrompt.js";
import type { AIResponseDecision } from "../types.js";
import { getDelaySeconds } from "./responseDelay.js";
import { checkSafety } from "./safetyChecker.js";
import { requestAiJson } from "./openaiClient.js";
import { detectSalesHandoff } from "./salesHandoff.js";

const knowledgeRoot = path.join(process.cwd(), "src", "ai", "knowledge");

const intentEnum = ["details", "price", "solo", "life_on_board", "seasick", "safety", "flights", "booking_payment", "contract", "thinking", "emotional_warm", "relative_concern", "date_unavailable", "unknown"] as const;

const decisionSchema = z.object({
  intent: z.enum(intentEnum),
  decision: z.enum(["ai_auto_send", "human_handoff"]),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  clientMood: z.string(),
  detectedFear: z.string(),
  answerText: z.string(),
  assistantNote: z.string(),
  handoffReason: z.string(),
  delaySeconds: z.number(),
  shouldNotifyAssistant: z.boolean(),
  shouldSaveMemory: z.boolean(),
  forbiddenTriggered: z.boolean()
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: intentEnum },
    decision: { type: "string", enum: ["ai_auto_send", "human_handoff"] },
    confidence: { type: "number" },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    clientMood: { type: "string" },
    detectedFear: { type: "string" },
    answerText: { type: "string" },
    assistantNote: { type: "string" },
    handoffReason: { type: "string" },
    delaySeconds: { type: "number" },
    shouldNotifyAssistant: { type: "boolean" },
    shouldSaveMemory: { type: "boolean" },
    forbiddenTriggered: { type: "boolean" }
  },
  required: ["intent", "decision", "confidence", "riskLevel", "clientMood", "detectedFear", "answerText", "assistantNote", "handoffReason", "delaySeconds", "shouldNotifyAssistant", "shouldSaveMemory", "forbiddenTriggered"]
} as const;

export async function classifyWithAI(input: string, conversationContext: MessageRecord[]): Promise<AIResponseDecision> {
  const handoff = detectSalesHandoff(input);
  if (handoff && env.HUMAN_HANDOFF_ON_SALES) {
    return humanHandoff(input, handoff.intent, handoff.reason, true);
  }

  if (!env.AI_RESPONSES_ENABLED || !env.OPENAI_API_KEY) {
    return humanHandoff(input, detectIntent(input), "AI отключён или ключ не задан", false);
  }

  try {
    const { parsed, raw } = await requestAiJson<unknown>(
      buildResponsePrompt({ messageText: input, history: conversationContext, knowledge: loadKnowledge() }),
      jsonSchema
    );
    const decision = decisionSchema.parse(parsed);

    const safety = checkSafety(decision.answerText);
    const canAutoSend =
      env.AI_AUTO_SEND_ENABLED &&
      decision.decision === "ai_auto_send" &&
      decision.riskLevel === "low" &&
      decision.confidence >= env.AUTO_SEND_CONFIDENCE_THRESHOLD &&
      !decision.forbiddenTriggered &&
      safety.safe;

    if (!canAutoSend) {
      return {
        ...decision,
        decision: "human_handoff",
        riskLevel: decision.riskLevel === "low" ? "medium" : decision.riskLevel,
        answerText: "",
        shouldNotifyAssistant: true,
        handoffReason: decision.handoffReason || `AI не прошёл пороги автоответа${safety.flags.length ? `: ${safety.flags.join(", ")}` : ""}`,
        delaySeconds: 0,
        raw
      };
    }

    return {
      ...decision,
      delaySeconds: getDelaySeconds("ai_auto_send", decision.intent, input.length),
      shouldNotifyAssistant: false,
      raw
    };
  } catch (error) {
    return humanHandoff(input, detectIntent(input), `AI fallback: ${error instanceof Error ? error.message : String(error)}`, false);
  }
}

function loadKnowledge(): unknown {
  return {
    styleGuide: readText("maeva_style_guide.md"),
    scriptedResponses: readJson("scripted_responses.json"),
    responseExamples: readJson("response_examples.json"),
    faq: readJson("faq_knowledge.json"),
    handoffRules: readJson("handoff_rules.json"),
    forbiddenPhrases: readJson("forbidden_phrases.json")
  };
}

function detectIntent(text: string): AIResponseDecision["intent"] {
  if (/одн(а|ой)|никого не знаю/i.test(text)) return "solo";
  if (/стоим|цен|сколько/i.test(text)) return "price";
  if (/договор|чек/i.test(text)) return "contract";
  if (/брон|оплат|реквиз/i.test(text)) return "booking_payment";
  if (/турц|таиланд|подроб/i.test(text)) return "details";
  return "unknown";
}

function humanHandoff(
  input: string,
  intent: AIResponseDecision["intent"],
  reason: string,
  forbiddenTriggered: boolean
): AIResponseDecision {
  return {
    intent,
    decision: "human_handoff",
    confidence: forbiddenTriggered ? 1 : 0.5,
    riskLevel: forbiddenTriggered ? "high" : "medium",
    clientMood: "",
    detectedFear: intent === "solo" ? "боится ехать одной" : "",
    answerText: "",
    assistantNote: `Клиент написал: "${input}". Бот молчит. Причина передачи: ${reason}`,
    handoffReason: reason,
    delaySeconds: 0,
    shouldNotifyAssistant: true,
    shouldSaveMemory: false,
    forbiddenTriggered
  };
}

function readText(fileName: string): string {
  return fs.readFileSync(path.join(knowledgeRoot, fileName), "utf8");
}

function readJson<T = unknown>(fileName: string): T {
  return JSON.parse(readText(fileName)) as T;
}

