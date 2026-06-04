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
  const response = await fetch(`${normalizeBaseUrl(env.OPENAI_BASE_URL)}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an AI assistant for Telegram Business replies. Return only valid JSON that matches the schema."
        },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "maeva_reply_decision",
          strict: true,
          schema: aiDecisionSchema
        }
      }
    })
  });

  const body = await response.json() as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(`AI provider response failed ${response.status}: ${JSON.stringify(body)}`);
  }

  const outputText = extractChatCompletionText(body);
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

const aiDecisionSchema = {
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
} as const;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: unknown;
};

function extractChatCompletionText(body: ChatCompletionResponse): string {
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI provider response did not include message content");
  return text;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
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
