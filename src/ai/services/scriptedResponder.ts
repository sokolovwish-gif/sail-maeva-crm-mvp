import fs from "node:fs";
import path from "node:path";
import { env } from "../../config/env.js";
import type { AIIntent, AIResponseDecision } from "../types.js";
import { getDelaySeconds } from "./responseDelay.js";
import { checkSafety } from "./safetyChecker.js";

const knowledgeRoot = path.join(process.cwd(), "src", "ai", "knowledge");

type ScriptMode = "scripted_auto_send" | "ai_auto_send" | "human_handoff";

type ScriptVariant = {
  id: string;
  text: string;
};

type ScriptIntent = {
  id: string;
  mode: ScriptMode;
  description?: string;
  triggers: string[];
  negative_triggers?: string[];
  variants?: ScriptVariant[];
  handoff_reason?: string;
};

type ScriptLibrary = {
  version: number;
  global_rules: {
    delay_seconds: { min: number; max: number };
    priority: ScriptMode[];
    never_auto_send_if_contains: string[];
    forbidden_auto_phrases: string[];
  };
  intents: ScriptIntent[];
};

export type ScriptedMatch = {
  decision: AIResponseDecision;
  intentId: string;
  variantId?: string;
};

export function findScriptedResponse(input: string, options: { lastVariantId?: string } = {}): AIResponseDecision | undefined {
  return matchScriptedResponse(input, options)?.decision;
}

export function matchScriptedResponse(input: string, options: { lastVariantId?: string } = {}): ScriptedMatch | undefined {
  const library = readScriptedResponses();
  const normalized = normalize(input);

  const globalHandoff = findMatchedPhrase(normalized, library.global_rules.never_auto_send_if_contains);
  if (globalHandoff) {
    return buildHandoff("human_handoff_sales", "Правило never_auto_send_if_contains: " + globalHandoff);
  }

  const humanMatch = bestIntentMatch(normalized, library.intents.filter((intent) => intent.mode === "human_handoff"));
  if (humanMatch) {
    return buildHandoff(humanMatch.intent.id, humanMatch.intent.handoff_reason ?? humanMatch.intent.description ?? "Нужен человек");
  }

  if (!env.SCRIPTED_AUTO_SEND_ENABLED) return undefined;

  const scriptedMatch = bestIntentMatch(normalized, library.intents.filter((intent) => intent.mode === "scripted_auto_send"));
  if (!scriptedMatch) return undefined;

  const variant = pickVariant(scriptedMatch.intent.variants ?? [], options.lastVariantId);
  if (!variant) return undefined;

  const forbiddenPhrase = findMatchedPhrase(normalize(variant.text), library.global_rules.forbidden_auto_phrases);
  const safety = checkSafety(variant.text);
  if (forbiddenPhrase || !safety.safe) {
    return buildHandoff(
      scriptedMatch.intent.id,
      forbiddenPhrase ? `Скрипт заблокирован forbidden_auto_phrases: ${forbiddenPhrase}` : `Скрипт заблокирован safety checker: ${safety.flags.join(", ")}`
    );
  }

  const intent = toAIIntent(scriptedMatch.intent.id);
  const decision: AIResponseDecision = {
    intent,
    decision: "scripted_auto_send",
    confidence: Math.min(0.99, 0.82 + scriptedMatch.score * 0.06),
    riskLevel: "low",
    clientMood: "",
    detectedFear: intent === "solo" ? "боится ехать одной" : "",
    answerText: variant.text,
    assistantNote: `Сработал скрипт ${scriptedMatch.intent.id}, совпало триггеров: ${scriptedMatch.score}`,
    handoffReason: "",
    matchedIntentId: scriptedMatch.intent.id,
    matchedVariantId: variant.id,
    delaySeconds: getScriptDelaySeconds(library, intent, input.length),
    shouldNotifyAssistant: false,
    shouldSaveMemory: false,
    forbiddenTriggered: false
  };

  return {
    decision,
    intentId: scriptedMatch.intent.id,
    variantId: variant.id
  };
}

function buildHandoff(intentId: string, reason: string): ScriptedMatch {
  return {
    intentId,
    decision: {
      intent: toAIIntent(intentId),
      decision: "human_handoff",
      confidence: 1,
      riskLevel: "high",
      clientMood: "",
      detectedFear: "",
      answerText: "",
      assistantNote: `Бот молчит. Причина передачи: ${reason}`,
      handoffReason: reason,
      matchedIntentId: intentId,
      delaySeconds: 0,
      shouldNotifyAssistant: true,
      shouldSaveMemory: false,
      forbiddenTriggered: true
    }
  };
}

function bestIntentMatch(normalizedText: string, intents: ScriptIntent[]): { intent: ScriptIntent; score: number } | undefined {
  let best: { intent: ScriptIntent; score: number } | undefined;

  for (const intent of intents) {
    if (hasAny(normalizedText, intent.negative_triggers ?? [])) continue;

    const score = countMatches(normalizedText, intent.triggers);
    if (score === 0) continue;
    if (!best || score > best.score) best = { intent, score };
  }

  return best;
}

function pickVariant(variants: ScriptVariant[], lastVariantId?: string): ScriptVariant | undefined {
  if (variants.length === 0) return undefined;
  const available = variants.length > 1 ? variants.filter((variant) => variant.id !== lastVariantId) : variants;
  return available[Math.floor(Math.random() * available.length)] ?? available[0];
}

function getScriptDelaySeconds(library: ScriptLibrary, intent: AIIntent, messageLength: number): number {
  const configuredMin = library.global_rules.delay_seconds.min;
  const configuredMax = library.global_rules.delay_seconds.max;
  if (Number.isFinite(configuredMin) && Number.isFinite(configuredMax)) {
    const min = Math.max(0, configuredMin);
    const max = Math.max(min, configuredMax);
    const longMessageMin = messageLength > 220 ? Math.max(min, 90) : min;
    const cappedMax = intent === "details" || intent === "solo" ? Math.min(max, messageLength > 220 ? 140 : 90) : max;
    return longMessageMin + Math.floor(Math.random() * (Math.max(longMessageMin, cappedMax) - longMessageMin + 1));
  }
  return getDelaySeconds("scripted_auto_send", intent, messageLength);
}

function countMatches(text: string, triggers: string[]): number {
  return triggers.reduce((count, trigger) => count + (text.includes(normalize(trigger)) ? 1 : 0), 0);
}

function hasAny(text: string, phrases: string[]): boolean {
  return Boolean(findMatchedPhrase(text, phrases));
}

function findMatchedPhrase(text: string, phrases: string[]): string | undefined {
  return phrases.find((phrase) => text.includes(normalize(phrase)));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function toAIIntent(intentId: string): AIIntent {
  if (intentId.includes("solo")) return "solo";
  if (intentId.includes("turkey") || intentId.includes("thailand") || intentId.includes("details") || intentId.includes("first_touch")) return "details";
  if (intentId.includes("life")) return "life_on_board";
  if (intentId.includes("seasick")) return "seasick";
  if (intentId.includes("safety")) return "safety";
  if (intentId.includes("flight")) return "flights";
  if (intentId.includes("thinking")) return "thinking";
  if (intentId.includes("emotional")) return "emotional_warm";
  if (intentId.includes("relative")) return "relative_concern";
  if (intentId.includes("sales")) return "booking_payment";
  return "unknown";
}

function readScriptedResponses(): ScriptLibrary {
  return JSON.parse(fs.readFileSync(path.join(knowledgeRoot, "scripted_responses.json"), "utf8")) as ScriptLibrary;
}
