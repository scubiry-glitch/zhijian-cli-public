#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cases = JSON.parse(
  fs.readFileSync(path.join(root, "tests/contract/cases.json"), "utf8"),
);

// Load TS plan via tsx
const tsxBin = path.join(root, "packages/ts-cli/node_modules/.bin/tsx");

function tsPlan(argv) {
  const code = `
import { buildRequestPlan } from "./packages/ts-cli/src/request-plan.ts";
console.log(JSON.stringify(buildRequestPlan(${JSON.stringify(argv)})));
`.trim();
  const r = spawnSync(tsxBin, ["--eval", code], { encoding: "utf8", cwd: root });
  if (r.status !== 0) {
    throw new Error(`TS plan failed: ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout);
}

function pyPlan(argv) {
  const r = spawnSync(
    "python3",
    ["-c", "import json,sys; from zyt.request_plan import build_request_plan; print(json.dumps(build_request_plan(json.loads(sys.argv[1])), ensure_ascii=False))", JSON.stringify(argv)],
    { encoding: "utf8", cwd: root, env: { ...process.env, PYTHONPATH: path.join(root, "python") } },
  );
  if (r.status !== 0) {
    throw new Error(`PY plan failed for ${JSON.stringify(argv)}: ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout);
}

let failed = 0;
for (const c of cases) {
  const a = tsPlan(c.argv);
  const b = pyPlan(c.argv);
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) {
    failed++;
    console.error("MISMATCH", c.argv);
    console.error(" TS", sa);
    console.error(" PY", sb);
  } else {
    console.log("OK", c.argv[0], c.argv.slice(1).join(" "));
  }
}

if (failed) {
  console.error(`Failed: ${failed}`);
  process.exit(1);
}
console.log(`All ${cases.length} contract cases passed`);
