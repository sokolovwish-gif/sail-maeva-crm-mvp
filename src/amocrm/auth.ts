import { env } from "../config/env.js";

export async function refreshAmoToken(): Promise<{ access_token: string; refresh_token: string }> {
  if (!env.AMO_BASE_URL || !env.AMO_CLIENT_ID || !env.AMO_CLIENT_SECRET || !env.AMO_REDIRECT_URI || !env.AMO_REFRESH_TOKEN) {
    throw new Error("amoCRM OAuth env vars are incomplete");
  }

  const response = await fetch(`${env.AMO_BASE_URL}/oauth2/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.AMO_CLIENT_ID,
      client_secret: env.AMO_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: env.AMO_REFRESH_TOKEN,
      redirect_uri: env.AMO_REDIRECT_URI
    })
  });

  if (!response.ok) {
    throw new Error(`amoCRM token refresh failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<{ access_token: string; refresh_token: string }>;
}
