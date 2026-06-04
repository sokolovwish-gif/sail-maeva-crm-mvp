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

const knowledgeRoot = path.join(process.cwd(), "src", "ai", "knowledge");

const decisionSchema = z.object({
  intent: z.enum(["details", "price", "solo", "life_on_board", "seasick", "safety", "flights", "booking_payment", "contract", "thinking", "emotional_warm", "relative_concern", "date_unavailable", "unknown"]),
  decision: z.enum(["auto_send", "draft_for_assistant", "hold_for_human"]),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  clientMood: z.string(),
  detectedFear: z.string(),
  answerText: z.string(),
  assistantNote: z.string(),
  delaySeconds: z.number(),
  shouldNotifyAssistant: z.boolean(),
  shouldSaveMemory: z.boolean(),
  forbiddenTriggered: z.boolean()
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["details", "price", "solo", "life_on_board", "seasick", "safety", "flights", "booking_payment", "contract", "thinking", "emotional_warm", "relative_concern", "date_unavailable", "unknown"] },
    decision: { type: "string", enum: ["auto_send", "draft_for_assistant", "hold_for_human"] },
    confidence: { type: "number" },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    clientMood: { type: "string" },
    detectedFear: { type: "string" },
    answerText: { type: "string" },
    assistantNote: { type: "string" },
    delaySeconds: { type: "number" },
    shouldNotifyAssistant: { type: "boolean" },
    shouldSaveMemory: { type: "boolean" },
    forbiddenTriggered: { type: "boolean" }
  },
  required: ["intent", "decision", "confidence", "riskLevel", "clientMood", "detectedFear", "answerText", "assistantNote", "delaySeconds", "shouldNotifyAssistant", "shouldSaveMemory", "forbiddenTriggered"]
} as const;

export async function classifyWithAI(input: string, conversationContext: MessageRecord[]): Promise<AIResponseDecision> {
  const handoff = detectHandoff(input);
  if (handoff) return fallbackDecision(input, handoff.intent, "hold_for_human", handoff.reason, true);

  if (!env.AI_RESPONSES_ENABLED || !env.OPENAI_API_KEY) {
    return fallbackDecision(input, detectIntent(input), "draft_for_assistant", "AI отключён или ключ не задан", false);
  }

  try {
    const { parsed, raw } = await requestAiJson<unknown>(
      buildResponsePrompt({ messageText: input, history: conversationContext, knowledge: loadKnowledge() }),
      jsonSchema
    );
    const decision = decisionSchema.parse(parsed);
    const delaySeconds = getDelaySeconds(decision.decision, decision.intent, input.length);

    if (decision.confidence < env.HUMAN_HANDOFF_CONFIDENCE_THRESHOLD) {
      return { ...decision, decision: "hold_for_human", riskLevel: "high", shouldNotifyAssistant: true, delaySeconds: 0, raw };
    }

    if (decision.confidence < env.AUTO_SEND_CONFIDENCE_THRESHOLD && decision.decision === "auto_send") {
      return { ...decision, decision: "draft_for_assistant", riskLevel: "medium", shouldNotifyAssistant: true, delaySeconds: 0, raw };
    }

    return { ...decision, delaySeconds, raw };
  } catch (error) {
    return fallbackDecision(input, detectIntent(input), "draft_for_assistant", `AI JSON fallback: ${error instanceof Error ? error.message : String(error)}`, false);
  }
}

function loadKnowledge(): unknown {
  return {
    styleGuide: readText("maeva_style_guide.md"),
    responseExamples: readJson("response_examples.json"),
    faq: readJson("faq_knowledge.json"),
    handoffRules: readJson("handoff_rules.json"),
    forbiddenPhrases: readJson("forbidden_phrases.json")
  };
}

function detectHandoff(text: string): { intent: AIResponseDecision["intent"]; reason: string } | undefined {
  const normalized = text.toLowerCase();
  const rules = readJson<{ always_hold?: string[] }>("handoff_rules.json").always_hold ?? [];
  const matched = rules.find((item) => normalized.includes(item.toLowerCase()));
  if (!matched) return undefined;
  return {
    intent: /договор/i.test(matched) ? "contract" : /бронь|забронировать|оплат|реквизит|стоимость/i.test(matched) ? "booking_payment" : "unknown",
    reason: `Тема требует человека: ${matched}`
  };
}

function detectIntent(text: string): AIResponseDecision["intent"] {
  if (/одн(а|ой)|никого не знаю/i.test(text)) return "solo";
  if (/стоим|цен|сколько/i.test(text)) return "price";
  if (/договор/i.test(text)) return "contract";
  if (/брон|оплат|реквиз/i.test(text)) return "booking_payment";
  if (/турц|таиланд|подроб/i.test(text)) return "details";
  return "unknown";
}

function fallbackDecision(
  input: string,
  intent: AIResponseDecision["intent"],
  decision: AIResponseDecision["decision"],
  reason: string,
  forbiddenTriggered: boolean
): AIResponseDecision {
  const safety = checkSafety(input);
  return {
    intent,
    decision,
    confidence: forbiddenTriggered ? 1 : 0.45,
    riskLevel: decision === "hold_for_human" ? "high" : "medium",
    clientMood: "",
    detectedFear: intent === "solo" ? "боится ехать одной" : "",
    answerText: intent === "solo"
      ? "Ой, это очень понятный страх. Я бы ответила мягко: одной ехать нормально, многие приезжают без знакомых, а Маша заранее знакомится с каждым, чтобы на борту было спокойно."
      : `Клиент написал: "${input}". Подготовь ответ в стиле Маши, без выдуманных фактов.`,
    assistantNote: `${reason}${safety.flags.length ? `; safety: ${safety.flags.join(", ")}` : ""}`,
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

