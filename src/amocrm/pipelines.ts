import type { AmoClient } from "./client.js";
import { amoPipelineName, amoStatusNames } from "../config/amoStatuses.js";

type Pipeline = { id: number; name: string; _embedded?: { statuses?: Array<{ id: number; name: string }> } };

export async function getPipelines(client: AmoClient): Promise<Pipeline[]> {
  const response = await client.request<{ _embedded?: { pipelines?: Pipeline[] } }>("/api/v4/leads/pipelines");
  return response._embedded?.pipelines ?? [];
}

export async function inspectPipelines(client: AmoClient) {
  const pipelines = await getPipelines(client);
  const pipeline = pipelines.find((item) => item.name === amoPipelineName);
  const existingStatuses = new Set(pipeline?._embedded?.statuses?.map((status) => status.name) ?? []);
  const missingStatuses = amoStatusNames.filter((name) => !existingStatuses.has(name));
  return { pipelines, pipeline, missingStatuses };
}
