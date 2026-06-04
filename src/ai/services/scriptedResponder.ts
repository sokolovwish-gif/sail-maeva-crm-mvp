import fs from "node:fs";
import path from "node:path";
import { env } from "../../config/env.js";
import type { AIIntent, AIResponseDecision } from "../types.js";
import { getDelaySeconds } from "./responseDelay.js";
import { checkSafety } from "./safetyChecker.js";
import { detectSalesHandoff } from "./salesHandoff.js";

const knowledgeRoot = path.join(process.cwd(), "src", "ai", "knowledge");

type ScriptedResponses = Partial<Record<AIIntent, string[]>>;

export function findScriptedResponse(input: string): AIResponseDecision | undefined {
  if (!env.SCRIPTED_AUTO_SEND_ENABLED) return undefined;

  const sales = detectSalesHandoff(input);
  if (sales) return undefined;

  const intent = detectScriptIntent(input);
  if (!intent) return undefined;

  const variants = readScriptedResponses()[intent] ?? [];
  if (variants.length === 0) return undefined;

  const answerText = pickVariant(variants);
  const safety = checkSafety(answerText);
  if (!safety.safe) return undefined;

  return {
    intent,
    decision: "scripted_auto_send",
    confidence: 0.95,
    riskLevel: "low",
    clientMood: "",
    detectedFear: intent === "solo" ? "боится ехать одной" : "",
    answerText,
    assistantNote: "Сработал готовый скрипт, совпадение безопасное и очевидное.",
    handoffReason: "",
    delaySeconds: getDelaySeconds("scripted_auto_send", intent, input.length),
    shouldNotifyAssistant: false,
    shouldSaveMemory: false,
    forbiddenTriggered: false
  };
}

function detectScriptIntent(text: string): AIIntent | undefined {
  if (/одн(а|ой)|никого не знаю|без подруг|без пары/i.test(text)) return "solo";
  if (/подроб|расскаж|формат|что за поезд|как проходит|турц|таиланд/i.test(text)) return "details";
  if (/на борту|жизнь на яхте|что делать|парус|управлять|чем занима/i.test(text)) return "life_on_board";
  if (/укач|морск.*болез|тошнит|качает/i.test(text)) return "seasick";
  if (/безопас|страшно|капитан|погод|шторм/i.test(text)) return "safety";
  if (/перел[её]т|авиа|аэропорт|билет/i.test(text)) return "flights";
  if (/подума|думаю|сомнева|пока реш/i.test(text)) return "thinking";
  if (/сложн|устал|выгор|перезагруз|очень хочу/i.test(text)) return "emotional_warm";
  return undefined;
}

function readScriptedResponses(): ScriptedResponses {
  return JSON.parse(fs.readFileSync(path.join(knowledgeRoot, "scripted_responses.json"), "utf8")) as ScriptedResponses;
}

function pickVariant(variants: string[]): string {
  return variants[Math.floor(Math.random() * variants.length)] ?? variants[0] ?? "";
}

