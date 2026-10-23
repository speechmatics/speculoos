/**
 * Generates schema/apiir.schema.json from the TypeScript types.
 *
 * The hand-written types are the single source of truth. Generating the schema
 * from them means a validator cannot drift from the contract — the failure mode
 * a hand-maintained Zod mirror has by construction.
 *
 *   node scripts/gen-schema.mjs          write the schema
 *   node scripts/gen-schema.mjs --check  fail if the committed schema is stale
 */
import { createGenerator } from "ts-json-schema-generator";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "schema/apiir.schema.json");

const schema = createGenerator({
  path: resolve(root, "src/index.ts"),
  tsconfig: resolve(root, "tsconfig.json"),
  type: "ApiIR",
  skipTypeCheck: true,
  topRef: true,
  additionalProperties: false,
}).createSchema("ApiIR");

// Sort keys so the output is byte-stable across machines and generator versions.
const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortKeys(value[k])]),
  );
};

const text = JSON.stringify(sortKeys(schema), null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = readFileSync(out, "utf8");
  if (current !== text) {
    console.error("schema/apiir.schema.json is stale. Run: pnpm schema");
    process.exit(1);
  }
  console.log("schema up to date");
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
}
