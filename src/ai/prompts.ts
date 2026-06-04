import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

export function loadStyleGuide(): string {
  return fs.readFileSync(path.join(root, "src/config/style_guide.md"), "utf8");
}

export function loadExamples(): unknown {
  return JSON.parse(fs.readFileSync(path.join(root, "src/config/examples.json"), "utf8"));
}
