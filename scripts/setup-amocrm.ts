import "dotenv/config";
import { AmoClient } from "../src/amocrm/client.js";
import { inspectPipelines } from "../src/amocrm/pipelines.js";
import { amoPipelineName } from "../src/config/amoStatuses.js";
import { leadFields, leadFieldEnums } from "../src/config/amoFields.js";

const client = new AmoClient();

if (!client.isConfigured()) {
  console.error("amoCRM is not configured. Fill AMO_BASE_URL and AMO_ACCESS_TOKEN in .env.");
  process.exit(1);
}

const report = await inspectPipelines(client);

console.log(`Pipeline required: ${amoPipelineName}`);
if (report.pipeline) {
  console.log(`Found pipeline: ${report.pipeline.name} (${report.pipeline.id})`);
} else {
  console.log("Pipeline is missing. Create it manually or add its ID to AMO_PIPELINE_ID after creation.");
}

if (report.missingStatuses.length) {
  console.log("Missing statuses:");
  for (const status of report.missingStatuses) console.log(`- ${status}`);
} else {
  console.log("All required statuses were found.");
}

console.log("\nLead fields to create/check:");
for (const [key, name] of Object.entries(leadFields)) {
  const enumValues = leadFieldEnums[key as keyof typeof leadFieldEnums];
  console.log(`- ${name}${enumValues ? `: ${enumValues.join(" / ")}` : ""}`);
}

console.log("\nAfter fields/statuses are ready, put pipeline/status IDs into .env.");
