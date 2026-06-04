import { env } from "../config/env.js";
import type { MessageRecord } from "../storage/db.js";
import { loadExamples, loadStyleGuide } from "./prompts.js";
import { evaluateSafety } from "./safetyRules.js";

export type AiMode = "auto_send" | "draft_for_assistant" | "hold_for_human";

export type AiDecision = {
  mode: AiMode;
  intent: string;
  confidence: number;
  riskFlags: string[];
  reason: string;
  draftText?: string;
  finalText?: string;
  raw?: unknown;
};

export async function decideAiReply(input: {
  messageText: string;
  history: MessageRecord[];
}): Promise<AiDecision> {
  const safety = evaluateSafety(input.messageText);
  if (safety.shouldHold) {
    return {
      mode: "hold_for_human",
      intent: "guarded_topic",
      confidence: 1,
      riskFlags: safety.flags,
      reason: safety.reason ?? "Требуется человек"
    };
  }

  if (!env.OPENAI_API_KEY || !env.AI_RESPONSES_ENABLED) {
    return fallbackDecision(input.messageText, safety.flags);
  }

  const prompt = buildPrompt(input.messageText, input.history);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "maeva_reply_decision",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              mode: { type: "string", enum: ["auto_send", "draft_for_assistant", "hold_for_human"] },
              intent: { type: "string" },
              confidence: { type: "number" },
              riskFlags: { type: "array", items: { type: "string" } },
              reason: { type: "string" },
              draftText: { type: "string" },
              finalText: { type: "string" }
            },
            required: ["mode", "intent", "confidence", "riskFlags", "reason", "draftText", "finalText"]
          },
          strict: true
        }
      }
    })
  });

  const body = await response.json() as { output_text?: string; error?: unknown };
  if (!response.ok) {
    throw new Error(`OpenAI response failed ${response.status}: ${JSON.stringify(body)}`);
  }

  const outputText = extractOutputText(body);
  const parsed = JSON.parse(outputText) as AiDecision;

  const secondSafety = evaluateSafety(`${parsed.finalText ?? ""}\n${parsed.draftText ?? ""}`);
  if (secondSafety.shouldHold) {
    return {
      ...parsed,
      mode: "hold_for_human",
      riskFlags: [...new Set([...parsed.riskFlags, ...secondSafety.flags])],
      reason: `Защитное правило после генерации: ${secondSafety.reason}`,
      finalText: undefined,
      raw: body
    };
  }

  return { ...parsed, raw: body };
}

function buildPrompt(messageText: string, history: MessageRecord[]): string {
  return JSON.stringify({
    task: "Прими решение для Telegram Business автоответа Sail Maeva.",
    rules: [
      "Если вопрос про оплату, договор, реквизиты, конфликт или бронь, mode должен быть hold_for_human и клиенту не отправляется автоответ.",
      "Если можно безопасно ответить мягко и обще, mode auto_send.",
      "Если ответ лучше подготовить ассистенту, но не отправлять автоматически, mode draft_for_assistant.",
      "Пиши в стиле Маши, без канцелярита и без давления.",
      "Не придумывай цены, даты, наличие мест, реквизиты и юридические обещания."
    ],
    styleGuide: loadStyleGuide(),
    examples: loadExamples(),
    history: history.map((item) => ({ direction: item.direction, text: item.text })),
    latestMessage: messageText,
    output: {
      mode: "auto_send | draft_for_assistant | hold_for_human",
      intent: "short label",
      confidence: "0..1",
      riskFlags: "array",
      reason: "short explanation",
      draftText: "assistant-facing draft or empty string",
      finalText: "client-facing reply for auto_send or empty string"
    }
  });
}

function extractOutputText(body: { output_text?: string; [key: string]: unknown }): string {
  if (body.output_text) return body.output_text;
  const output = body.output as Array<{ content?: Array<{ text?: string }> }> | undefined;
  const text = output?.flatMap((item) => item.content ?? []).map((item) => item.text).find(Boolean);
  if (!text) throw new Error("OpenAI response did not include output_text");
  return text;
}

function fallbackDecision(messageText: string, riskFlags: string[]): AiDecision {
  return {
    mode: "draft_for_assistant",
    intent: "needs_ai_or_assistant",
    confidence: 0.4,
    riskFlags,
    reason: "AI отключён или OPENAI_API_KEY не задан, поэтому нужен ассистент",
    draftText: `Клиент написал: "${messageText}". Подготовь тёплый ответ в стиле Маши.`,
    finalText: undefined
  };
}
