import fs from "node:fs";
import path from "node:path";
import type { AIResponseDecision } from "../types.js";

const knowledgeRoot = path.join(process.cwd(), "src", "ai", "knowledge");

export function checkSafety(text: string): { safe: boolean; flags: string[] } {
  const normalized = text.toLowerCase();
  const forbidden = readJson<string[]>("forbidden_phrases.json", []);
  const flags: string[] = [];

  for (const phrase of forbidden) {
    if (normalized.includes(phrase.toLowerCase())) flags.push(`forbidden:${phrase}`);
  }

  const riskyPatterns = [
    { name: "payment_details", pattern: /(номер карты|реквизит|перевод[а-я]*|оплат[а-я]* сюда)/i },
    { name: "exact_price", pattern: /\b\d{3,}\s?(евро|eur|€|руб|₽|\$|usd)\b/i },
    { name: "legal_promise", pattern: /(договор не нужен|гарантир[а-я]+|юридически)/i },
    { name: "availability_promise", pattern: /(место точно|место за вами|точно есть место)/i }
  ];

  for (const rule of riskyPatterns) {
    if (rule.pattern.test(text)) flags.push(rule.name);
  }

  if (text.length > 1200) flags.push("too_long");

  return { safe: flags.length === 0, flags };
}

export function applySafetyDecision(decision: AIResponseDecision): AIResponseDecision {
  const safety = checkSafety(decision.answerText);
  if (safety.safe && !decision.forbiddenTriggered) return decision;

  return {
    ...decision,
    decision: "draft_for_assistant",
    riskLevel: decision.riskLevel === "low" ? "medium" : decision.riskLevel,
    shouldNotifyAssistant: true,
    forbiddenTriggered: true,
    assistantNote: `${decision.assistantNote}\nSafety flags: ${safety.flags.join(", ")}`
  };
}

function readJson<T>(fileName: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(knowledgeRoot, fileName), "utf8")) as T;
  } catch {
    return fallback;
  }
}

