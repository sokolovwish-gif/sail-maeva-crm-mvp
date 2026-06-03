# Cloud deploy for first live test

Recommended path: deploy this server as a small web service with a public HTTPS URL, then use that URL as `PUBLIC_WEBHOOK_URL`.

## Required environment variables

Set these in the hosting provider dashboard:

```env
NODE_ENV=production
PORT=3000
DATABASE_PATH=/tmp/sail-maeva.sqlite
ALLOW_NON_BUSINESS_MESSAGES=false
ALLOWED_TELEGRAM_USER_IDS=your_numeric_test_user_id

TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
PUBLIC_WEBHOOK_URL=https://your-service-url

AMO_BASE_URL=...
AMO_ACCESS_TOKEN=...
AMO_REFRESH_TOKEN=...
AMO_PIPELINE_ID=...
AMO_STATUS_NEW_ID=...
AMO_STATUS_BOT_REPLIED_ID=...
AMO_STATUS_CLARIFYING_ID=...
AMO_STATUS_INTEREST_ID=...
AMO_STATUS_HOT_ID=...
AMO_STATUS_ASSISTANT_ID=...

ASSISTANT_TELEGRAM_CHAT_ID=...
```

Optional amoCRM field IDs:

```env
AMO_CONTACT_FIELD_TELEGRAM_USERNAME_ID=
AMO_CONTACT_FIELD_TELEGRAM_USER_ID=
AMO_LEAD_FIELD_DIRECTION_ID=
AMO_LEAD_FIELD_FEAR_ID=
AMO_LEAD_FIELD_INTEREST_LEVEL_ID=
AMO_LEAD_FIELD_OWNER_ID=
```

## Start commands

If the provider uses Node buildpacks:

```bash
npm ci
npm run build
npm start
```

If the provider supports Docker, use the included `Dockerfile`.

## After deploy

1. Open:

```text
https://your-service-url/health
```

Expected response:

```json
{"ok":true,"service":"sail-maeva-crm-mvp"}
```

2. Put the exact base URL into `PUBLIC_WEBHOOK_URL`.

3. Run locally with the same `.env`, or from the provider console if available:

```bash
npm run telegram:set-webhook
```

The webhook will be installed at:

```text
https://your-service-url/telegram/webhook
```

4. Send one test message from the allowed Telegram user_id to Masha's Telegram Business account:

```text
Привет, хочу забронировать место, как оплатить?
```

Expected result:

- SQLite logs the inbound message.
- amoCRM gets/updates contact and lead.
- Lead gets a note with the inbound message.
- Lead status becomes `Горячий лид`.
- Assistant task is created.
- Client receives an auto-reply.
- Assistant receives a Telegram notification.

## Important for MVP

`DATABASE_PATH=/tmp/sail-maeva.sqlite` is fine for the first live test, but it is not durable storage. For production, move storage to a persistent database such as Postgres or a mounted persistent disk.
