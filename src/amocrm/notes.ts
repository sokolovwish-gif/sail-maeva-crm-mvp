import type { AmoClient } from "./client.js";

export async function addLeadNote(client: AmoClient, leadId: number, text: string): Promise<void> {
  await client.request(`/api/v4/leads/${leadId}/notes`, {
    method: "POST",
    body: [{
      note_type: "common",
      params: { text }
    }]
  });
}
