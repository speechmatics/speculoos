import { describe, expect, it } from "vitest";
import { apiIRSchema, parseApiIR, validateApiIR } from "../src/validate.js";
import { ir } from "./fixture.js";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("validate", () => {
  it("accepts a well-formed document", () => {
    expect(validateApiIR(clone(ir))).toEqual({ valid: true, errors: [] });
  });

  it("rejects a missing required section", () => {
    const broken = clone(ir) as unknown as Record<string, unknown>;
    delete broken["info"];
    expect(validateApiIR(broken).valid).toBe(false);
  });

  it("rejects an unknown operation kind, which a transform could easily produce", () => {
    const broken = clone(ir);
    (broken.endpoints[0]!.operations[0] as { kind: string }).kind = "nonsense";
    expect(validateApiIR(broken).valid).toBe(false);
  });

  it("rejects an unknown node kind inside the registry", () => {
    const broken = clone(ir);
    (broken.schemas["demo#/components/schemas/Language"]!.node as { kind: string }).kind = "money";
    expect(validateApiIR(broken).valid).toBe(false);
  });

  it("throws from parseApiIR with a pointer to the problem", () => {
    const broken = clone(ir) as unknown as Record<string, unknown>;
    delete broken["provenance"];
    expect(() => parseApiIR(broken)).toThrow(/Invalid ApiIR/);
  });

  it("exports the schema as plain data for non-JS consumers", () => {
    expect(apiIRSchema["$ref"]).toBe("#/definitions/ApiIR");
    expect(Object.keys(apiIRSchema["definitions"] as object).length).toBeGreaterThan(50);
  });
});
