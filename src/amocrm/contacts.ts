import { env } from "../config/env.js";
import type { AmoClient } from "./client.js";

type AmoContact = { id: number; name?: string };
type ContactsResponse = { _embedded?: { contacts?: AmoContact[] } };

export async function findContact(client: AmoClient, query: string): Promise<AmoContact | undefined> {
  const response = await client.request<ContactsResponse>("/api/v4/contacts", { query: { query } });
  return response._embedded?.contacts?.[0];
}

export async function createContact(client: AmoClient, input: {
  name: string;
  username?: string;
  telegramUserId?: string;
  tags?: string[];
}): Promise<AmoContact> {
  const response = await client.request<{ _embedded: { contacts: AmoContact[] } }>("/api/v4/contacts", {
    method: "POST",
    body: [{
      name: input.username ? `${input.name} (@${input.username})` : input.name,
      custom_fields_values: [
        input.username && env.AMO_CONTACT_FIELD_TELEGRAM_USERNAME_ID
          ? textField(env.AMO_CONTACT_FIELD_TELEGRAM_USERNAME_ID, `@${input.username}`)
          : undefined,
        input.telegramUserId && env.AMO_CONTACT_FIELD_TELEGRAM_USER_ID
          ? textField(env.AMO_CONTACT_FIELD_TELEGRAM_USER_ID, input.telegramUserId)
          : undefined
      ].filter(Boolean),
      _embedded: {
        tags: input.tags?.map((name) => ({ name })) ?? []
      }
    }]
  });

  return response._embedded.contacts[0];
}

function textField(fieldId: number, value: string) {
  return { field_id: fieldId, values: [{ value }] };
}
