import type { AmoClient } from "./client.js";

export async function createLeadTask(client: AmoClient, leadId: number, text = "Связаться с горячим лидом"): Promise<void> {
  const completeTill = Math.floor(Date.now() / 1000) + 30 * 60;
  await client.request("/api/v4/tasks", {
    method: "POST",
    body: [{
      entity_id: leadId,
      entity_type: "leads",
      text,
      complete_till: completeTill
    }]
  });
}
