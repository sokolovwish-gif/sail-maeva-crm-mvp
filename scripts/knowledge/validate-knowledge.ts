import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "src", "ai", "knowledge");
const jsonFiles = [
  "response_examples.json",
  "scripted_responses.json",
  "faq_knowledge.json",
  "handoff_rules.json",
  "forbidden_phrases.json",
  "product_facts.schema.json",
  "eval_cases.json"
];

const errors: string[] = [];

for (const file of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    console.log(`OK ${file}`);
  } catch (error) {
    errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const examples = readJson<Array<{ id?: string; intent?: string; decision?: string }>>("response_examples.json", []);
for (const [index, example] of examples.entries()) {
  if (!example.id || !example.intent || !example.decision) {
    errors.push(`response_examples.json[${index}] must include id, intent, decision`);
  }
}

const forbidden = readJson<string[]>("forbidden_phrases.json", []);
if (forbidden.length === 0) errors.push("forbidden_phrases.json must not be empty");

const scripted = readJson<{
  version?: number;
  global_rules?: {
    never_auto_send_if_contains?: string[];
    forbidden_auto_phrases?: string[];
  };
  intents?: Array<{
    id?: string;
    mode?: string;
    triggers?: string[];
    variants?: Array<{ id?: string; text?: string }>;
    handoff_reason?: string;
  }>;
}>("scripted_responses.json", {});

if (!scripted.version) errors.push("scripted_responses.json must include version");
if (!scripted.global_rules?.never_auto_send_if_contains?.length) {
  errors.push("scripted_responses.json global_rules.never_auto_send_if_contains must not be empty");
}
if (!scripted.global_rules?.forbidden_auto_phrases?.length) {
  errors.push("scripted_responses.json global_rules.forbidden_auto_phrases must not be empty");
}
if (!scripted.intents?.length) errors.push("scripted_responses.json must include intents");

for (const [index, intent] of (scripted.intents ?? []).entries()) {
  if (!intent.id || !intent.mode || !Array.isArray(intent.triggers)) {
    errors.push(`scripted_responses.json intents[${index}] must include id, mode, triggers`);
  }
  if (intent.mode === "scripted_auto_send") {
    if (!intent.variants || intent.variants.length < 2) {
      errors.push(`scripted_responses.json ${intent.id} must include at least 2 variants`);
    }
    for (const [variantIndex, variant] of (intent.variants ?? []).entries()) {
      if (!variant.id || !variant.text) {
        errors.push(`scripted_responses.json ${intent.id}.variants[${variantIndex}] must include id and text`);
      }
    }
  }
  if (intent.mode === "human_handoff" && !intent.handoff_reason) {
    errors.push(`scripted_responses.json ${intent.id} must include handoff_reason`);
  }
}

if (errors.length > 0) {
  console.error("\nKnowledge validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("\nKnowledge validation passed.");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}
