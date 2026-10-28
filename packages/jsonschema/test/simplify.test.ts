import { describe, expect, it } from "vitest";
import { lowerOne } from "./helpers.js";

describe("foldNullableUnion", () => {
  it("folds anyOf: [X, null] into X with nullable", () => {
    const { node } = lowerOne({ anyOf: [{ type: "string" }, { type: "null" }] });
    expect(node).toMatchObject({ kind: "string", nullable: true });
  });

  it("keeps a real union but marks it nullable", () => {
    const { node } = lowerOne({
      oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
    });
    if (node.kind !== "union") throw new Error("expected union");
    expect(node.nullable).toBe(true);
    expect(node.variants).toHaveLength(2);
  });

  it("leaves a union of only null alone", () => {
    const { node } = lowerOne({ anyOf: [{ type: "null" }] });
    expect(node.kind).toBe("null");
  });
});

describe("constUnionToEnum", () => {
  it("collapses a oneOf of consts into a documented enum", () => {
    const { node } = lowerOne({
      oneOf: [
        { const: "standard", description: "Faster." },
        { const: "enhanced", description: "More accurate." },
      ],
    });
    if (node.kind !== "enum") throw new Error("expected enum");
    expect(node.baseType).toBe("string");
    expect(node.members.map((m) => m.value)).toEqual(["standard", "enhanced"]);
    expect(node.members[0]?.docs?.description).toBe("Faster.");
  });

  it("infers integer rather than number when every value is whole", () => {
    const { node } = lowerOne({ oneOf: [{ const: 1 }, { const: 2 }] });
    expect(node).toMatchObject({ kind: "enum", baseType: "integer" });
  });

  it("collapses one with a `type` beside it that every const already satisfies", () => {
    const { node, diagnostics } = lowerOne({
      type: "string",
      description: "Which kind.",
      oneOf: [
        { const: "a", description: "First." },
        { const: "b", description: "Second." },
      ],
    });
    if (node.kind !== "enum") throw new Error("expected enum");
    expect(node.docs.description).toBe("Which kind.");
    expect(node.members.map((m) => m.docs?.description)).toEqual(["First.", "Second."]);
    expect(diagnostics.map((d) => d.code)).not.toContain("UNION_WITH_SIBLINGS");
  });

  it("still intersects a `type` the consts do not satisfy", () => {
    const { node } = lowerOne({ type: "number", oneOf: [{ const: "a" }, { const: "b" }] });
    expect(node.kind).toBe("intersection");
  });

  it("leaves a mixed union alone", () => {
    const { node } = lowerOne({ oneOf: [{ const: "a" }, { type: "number" }] });
    expect(node.kind).toBe("union");
  });
});

describe("detectMap", () => {
  it("turns a property-free object with additionalProperties into a map", () => {
    const { node } = lowerOne({ type: "object", additionalProperties: { type: "number" } });
    expect(node).toMatchObject({ kind: "map", values: { kind: "number" } });
  });

  it("uses a single patternProperties entry as the key constraint", () => {
    const { node } = lowerOne({
      type: "object",
      patternProperties: { "^x-": { type: "string" } },
    });
    expect(node).toMatchObject({
      kind: "map",
      keys: { kind: "string", constraints: { pattern: "^x-" } },
      values: { kind: "string" },
    });
  });

  it("leaves an object that has real properties alone", () => {
    const { node } = lowerOne({
      type: "object",
      properties: { a: { type: "string" } },
      additionalProperties: { type: "number" },
    });
    expect(node.kind).toBe("object");
  });

  it("carries propertyNames across as the key type", () => {
    const { node } = lowerOne({
      type: "object",
      additionalProperties: { type: "number" },
      propertyNames: { type: "string", pattern: "^[a-z]+$" },
    });
    expect(node).toMatchObject({ kind: "map", keys: { constraints: { pattern: "^[a-z]+$" } } });
  });
});

describe("inferDiscriminator", () => {
  it("finds a shared const property with distinct values", () => {
    const { node } = lowerOne({
      oneOf: [
        { type: "object", properties: { message: { const: "StartRecognition" }, a: { type: "string" } } },
        { type: "object", properties: { message: { const: "AddAudio" }, b: { type: "string" } } },
      ],
    });
    if (node.kind !== "union") throw new Error("expected union");
    expect(node.discriminator).toEqual({ propertyName: "message", inferred: true });
    expect(node.variants.map((v) => v.discriminatorValue)).toEqual(["StartRecognition", "AddAudio"]);
  });

  it("ignores a const property whose values repeat", () => {
    const { node } = lowerOne({
      oneOf: [
        { type: "object", properties: { kind: { const: "same" }, a: { type: "string" } } },
        { type: "object", properties: { kind: { const: "same" }, b: { type: "string" } } },
      ],
    });
    expect((node as { discriminator?: unknown }).discriminator).toBeUndefined();
  });

  it("does not override a declared discriminator", () => {
    const { node } = lowerOne({
      oneOf: [
        { type: "object", properties: { t: { const: "a" } } },
        { type: "object", properties: { t: { const: "b" } } },
      ],
      discriminator: { propertyName: "t" },
    });
    expect(node).toMatchObject({ discriminator: { propertyName: "t", inferred: false } });
  });
});

describe("unwrapSingleVariant", () => {
  it("replaces a one-branch union with the branch itself", () => {
    const { node } = lowerOne({ oneOf: [{ type: "string", minLength: 2 }] });
    expect(node).toMatchObject({ kind: "string", constraints: { minLength: 2 } });
  });

  it("keeps the union's own docs when unwrapping", () => {
    const { node } = lowerOne({ title: "Wrapper", oneOf: [{ type: "string" }] });
    expect(node.docs.title).toBe("Wrapper");
  });
});

describe("pass ordering", () => {
  it("nullable folding runs before single-variant unwrap, so both apply", () => {
    // anyOf: [X, null] folds to X with nullable; without the ordering this
    // would leave a one-variant union behind.
    const { node } = lowerOne({ anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] });
    expect(node).toMatchObject({ kind: "string", nullable: true, constraints: { minLength: 1 } });
  });

  it("applies bottom-up, so nested schemas are simplified too", () => {
    const { node } = lowerOne({
      type: "object",
      properties: { a: { anyOf: [{ type: "string" }, { type: "null" }] } },
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]?.node).toMatchObject({ kind: "string", nullable: true });
  });

  it("nullable const-union still becomes a nullable enum", () => {
    const { node } = lowerOne({
      oneOf: [{ const: "a" }, { const: "b" }, { type: "null" }],
    });
    expect(node).toMatchObject({ kind: "enum", nullable: true });
  });
});
