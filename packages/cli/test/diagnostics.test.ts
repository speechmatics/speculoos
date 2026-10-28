/**
 * The diagnostic code catalogue, checked against what is actually emitted.
 *
 * Codes reach CI configuration through `lint --allow`, which makes them a
 * public contract; a catalogue that drifts from the code is worse than none,
 * because it is believed. This package depends on every adapter and on
 * transforms, so it is the one place that can see the whole set at once.
 */
import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_CODE_NAMES,
  UNSUPPORTED_KEYWORD_CODES,
  describeDiagnostic,
  type ApiIR,
} from "@speculoos/core";
import { specDir, type SpecName } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { buildAsyncApi } from "@speculoos/asyncapi";
import { hideInternal } from "@speculoos/transforms";

const SPECS: { file: SpecName; dialect: "openapi" | "asyncapi" }[] = [
  { file: "batch.yaml", dialect: "openapi" },
  { file: "realtime-v2.yaml", dialect: "asyncapi" },
  { file: "realtime-v3.yaml", dialect: "asyncapi" },
  { file: "reply-v3.yaml", dialect: "asyncapi" },
  { file: "avro-v3.yaml", dialect: "asyncapi" },
];

async function irFor(file: SpecName, dialect: "openapi" | "asyncapi"): Promise<ApiIR> {
  const project = await load({ root: specDir, documents: [{ name: "d", path: file }] });
  return dialect === "openapi" ? buildOpenApi({ project }) : buildAsyncApi({ project });
}

describe("the diagnostic catalogue", () => {
  it("covers every code the fixtures emit", async () => {
    const emitted = new Set<string>();
    for (const { file, dialect } of SPECS) {
      const ir = await irFor(file, dialect);
      for (const d of ir.diagnostics) emitted.add(d.code);
      // Transforms emit their own; run the one that does.
      for (const d of hideInternal()(ir).diagnostics) emitted.add(d.code);
    }
    const known = new Set(DIAGNOSTIC_CODE_NAMES);
    expect([...emitted].filter((c) => !known.has(c))).toEqual([]);
    expect(emitted.size).toBeGreaterThan(0);
  });

  it("agrees with the emitted severity for every code it saw", async () => {
    for (const { file, dialect } of SPECS) {
      const ir = await irFor(file, dialect);
      for (const d of ir.diagnostics) {
        expect(describeDiagnostic(d.code)?.severity, d.code).toBe(d.severity);
      }
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(DIAGNOSTIC_CODE_NAMES).size).toBe(DIAGNOSTIC_CODE_NAMES.length);
  });

  it("spells generated codes the way `lower` generates them", () => {
    // `code(keyword)` strips a leading $ and converts camelCase to SNAKE_CASE.
    const generate = (keyword: string): string =>
      keyword
        .replace(/^\$/, "")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toUpperCase();
    const keywords = ["if", "not", "dependentSchemas", "unevaluatedProperties", "unevaluatedItems", "$dynamicRef"];
    expect(keywords.map(generate).sort()).toEqual([...UNSUPPORTED_KEYWORD_CODES].sort());
  });

  it("lists every code the CLI will accept in --allow", () => {
    // `lint --allow` warns on anything not in this list, so the list has to
    // contain the codes a user would plausibly want to allow.
    for (const code of ["NOT", "IF", "ALLOF_CONFLICT", "UNION_WITH_SIBLINGS"]) {
      expect(DIAGNOSTIC_CODE_NAMES).toContain(code);
    }
  });

  it("gives every code a meaning and a source package", () => {
    for (const entry of DIAGNOSTIC_CODES) {
      expect(entry.meaning.length, entry.code).toBeGreaterThan(20);
      expect(entry.source, entry.code).toMatch(/^@speculoos\//);
    }
  });
});
