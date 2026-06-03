import { env } from "../config/env.js";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export class AmoClient {
  constructor(private readonly baseUrl = env.AMO_BASE_URL, private readonly accessToken = env.AMO_ACCESS_TOKEN) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.accessToken);
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!this.baseUrl || !this.accessToken) {
      throw new Error("amoCRM is not configured");
    }

    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json"
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (!response.ok) {
      throw new Error(`amoCRM request failed ${response.status} ${url.pathname}: ${await response.text()}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
