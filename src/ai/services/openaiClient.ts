import { env } from "../../config/env.js";
import { systemPrompt } from "../prompts/systemPrompt.js";

export async function requestAiJson<T>(prompt: string, schema: unknown): Promise<{ parsed: T; raw: unknown }> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

  const response = await fetch(`${normalizeBaseUrl(env.OPENAI_BASE_URL)}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "maeva_ai_decision",
          strict: true,
          schema
        }
      }
    })
  });

  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
  if (!response.ok) throw new Error(`AI provider response failed ${response.status}: ${JSON.stringify(body)}`);

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI provider response did not include message content");
  return { parsed: JSON.parse(content) as T, raw: body };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

