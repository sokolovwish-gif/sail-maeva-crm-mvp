import { env } from "../config/env.js";
import type { Classification } from "../logic/classifier.js";
import type { AmoClient } from "./client.js";

export type AmoLead = { id: number; name?: string; _links?: { self?: { href?: string } } };
type LeadsResponse = { _embedded?: { leads?: AmoLead[] } };

export async function findLead(client: AmoClient, query: string): Promise<AmoLead | undefined> {
  const response = await client.request<LeadsResponse>("/api/v4/leads", { query: { query } });
  return response._embedded?.leads?.[0];
}

export async function createLead(client: AmoClient, input: {
  name: string;
  contactId: number;
  tags: string[];
  classification?: Classification;
}): Promise<AmoLead> {
  const response = await client.request<{ _embedded: { leads: AmoLead[] } }>("/api/v4/leads", {
    method: "POST",
    body: [{
      name: input.name,
      pipeline_id: env.AMO_PIPELINE_ID,
      status_id: statusIdFor(input.classification?.status),
      custom_fields_values: customFields(input.classification),
      _embedded: {
        contacts: [{ id: input.contactId }],
        tags: input.tags.map((name) => ({ name }))
      }
    }]
  });
  return response._embedded.leads[0];
}

export async function updateLead(client: AmoClient, leadId: number, input: {
  statusId?: number;
  tags?: string[];
  classification?: Classification;
}): Promise<void> {
  await client.request(`/api/v4/leads/${leadId}`, {
    method: "PATCH",
    body: {
      status_id: input.statusId ?? statusIdFor(input.classification?.status),
      custom_fields_values: customFields(input.classification),
      _embedded: input.tags?.length ? { tags: input.tags.map((name) => ({ name })) } : undefined
    }
  });
}

export function leadUrl(leadId: number): string | undefined {
  if (!env.AMO_BASE_URL) return undefined;
  return `${env.AMO_BASE_URL.replace(/\/$/, "")}/leads/detail/${leadId}`;
}

function statusIdFor(status?: string): number | undefined {
  if (!status) return env.AMO_STATUS_NEW_ID;
  if (status === "Бот ответил") return env.AMO_STATUS_BOT_REPLIED_ID;
  if (status === "Выясняем запрос") return env.AMO_STATUS_CLARIFYING_ID;
  if (status === "Интерес есть") return env.AMO_STATUS_INTEREST_ID;
  if (status === "Горячий лид") return env.AMO_STATUS_HOT_ID;
  if (status === "Передан ассистенту") return env.AMO_STATUS_ASSISTANT_ID;
  return env.AMO_STATUS_NEW_ID;
}

function customFields(classification?: Classification) {
  if (!classification) return undefined;
  return [
    classification.destination && env.AMO_LEAD_FIELD_DIRECTION_ID
      ? textField(env.AMO_LEAD_FIELD_DIRECTION_ID, classification.destination)
      : undefined,
    classification.fear && env.AMO_LEAD_FIELD_FEAR_ID
      ? textField(env.AMO_LEAD_FIELD_FEAR_ID, classification.fear)
      : undefined,
    env.AMO_LEAD_FIELD_INTEREST_LEVEL_ID
      ? textField(env.AMO_LEAD_FIELD_INTEREST_LEVEL_ID, classification.isHot ? "горячий" : "тёплый")
      : undefined,
    env.AMO_LEAD_FIELD_OWNER_ID
      ? textField(env.AMO_LEAD_FIELD_OWNER_ID, classification.assignedTo ?? "бот")
      : undefined
  ].filter(Boolean);
}

function textField(fieldId: number, value: string) {
  return { field_id: fieldId, values: [{ value }] };
}
