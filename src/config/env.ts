import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_PATH: z.string().default("./data/sail-maeva.sqlite"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_WEBHOOK_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  SCRIPTED_AUTO_SEND_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  AI_RESPONSES_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  AI_AUTO_SEND_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  HUMAN_HANDOFF_ON_SALES: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  AI_REPLY_DELAY_MIN_SECONDS: z.coerce.number().default(45),
  AI_REPLY_DELAY_MAX_SECONDS: z.coerce.number().default(120),
  MIN_REPLY_DELAY_SECONDS: z.coerce.number().default(45),
  MAX_REPLY_DELAY_SECONDS: z.coerce.number().default(140),
  AUTO_SEND_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.82),
  HUMAN_HANDOFF_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.55),
  ALLOWED_TELEGRAM_USER_IDS: z.string().default("").transform((value) =>
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  ),
  ALLOW_NON_BUSINESS_MESSAGES: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  AMO_BASE_URL: z.string().optional(),
  AMO_CLIENT_ID: z.string().optional(),
  AMO_CLIENT_SECRET: z.string().optional(),
  AMO_REDIRECT_URI: z.string().optional(),
  AMO_ACCESS_TOKEN: z.string().optional(),
  AMO_REFRESH_TOKEN: z.string().optional(),
  AMO_PIPELINE_ID: z.coerce.number().optional(),
  AMO_STATUS_NEW_ID: z.coerce.number().optional(),
  AMO_STATUS_BOT_REPLIED_ID: z.coerce.number().optional(),
  AMO_STATUS_CLARIFYING_ID: z.coerce.number().optional(),
  AMO_STATUS_INTEREST_ID: z.coerce.number().optional(),
  AMO_STATUS_HOT_ID: z.coerce.number().optional(),
  AMO_STATUS_ASSISTANT_ID: z.coerce.number().optional(),
  AMO_CONTACT_FIELD_TELEGRAM_USERNAME_ID: z.coerce.number().optional(),
  AMO_CONTACT_FIELD_TELEGRAM_USER_ID: z.coerce.number().optional(),
  AMO_LEAD_FIELD_DIRECTION_ID: z.coerce.number().optional(),
  AMO_LEAD_FIELD_FEAR_ID: z.coerce.number().optional(),
  AMO_LEAD_FIELD_INTEREST_LEVEL_ID: z.coerce.number().optional(),
  AMO_LEAD_FIELD_OWNER_ID: z.coerce.number().optional(),
  ASSISTANT_TELEGRAM_CHAT_ID: z.string().optional(),
  MANAGER_TELEGRAM_CHAT_ID: z.string().optional()
});

export const env = schema.parse(process.env);
