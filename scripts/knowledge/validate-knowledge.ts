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

const scripted = readJson<Record<string, string[]>>("scripted_responses.json", {});
for (const [intent, variants] of Object.entries(scripted)) {
  if (!Array.isArray(variants) || variants.length < 2) {
    errors.push(`scripted_responses.json.${intent} must include at least 2 variants`);
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
