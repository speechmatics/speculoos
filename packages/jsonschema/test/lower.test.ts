import { describe, expect, it } from "vitest";
import { lowerOne, harness } from "./helpers.js";

describe("lower — leaves", () => {
  it("lowers scalars with their constraints", () => {
    const { node } = lowerOne({ type: "string", minLength: 2, format: "date-time" });
    expect(node).toMatchObject({
      kind: "string",
      constraints: { minLength: 2, format: "date-time" },
    });
  });

  it("distinguishes integer from number", () => {
    expect(lowerOne({ type: "integer" }).node).toMatchObject({ kind: "number", integer: true });
    expect(lowerOne({ type: "number" }).node).toMatchObject({ kind: "number", integer: false });
  });

  it("normalises exclusive bounds into Bound", () => {
    const { node } = lowerOne({ type: "number", exclusiveMinimum: 0, maximum: 10 });
    expect(node).toMatchObject({
      constraints: { minimum: { value: 0, exclusive: true }, maximum: { value: 10, exclusive: false } },
    });
  });

  it("maps `true` to any and `false` to never", () => {
    expect(lowerOne(true).node.kind).toBe("any");
    expect(lowerOne(false).node.kind).toBe("never");
  });

  it("folds a null type member into the nullable flag", () => {
    const { node } = lowerOne({ type: ["string", "null"] });
    expect(node).toMatchObject({ kind: "string", nullable: true });
  });

  it("emits a null node only when null is the sole allowed value", () => {
    expect(lowerOne({ type: "null" }).node).toMatchObject({ kind: "null", nullable: false });
  });
});

describe("lower — objects", () => {
  it("preserves source key order and lifts required", () => {
    const { node } = lowerOne({
      type: "object",
      properties: { zebra: { type: "string" }, apple: { type: "string" } },
      required: ["apple"],
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties.map((p) => p.name)).toEqual(["zebra", "apple"]);
    expect(node.properties.map((p) => p.required)).toEqual([false, true]);
  });

  it("lifts readOnly, writeOnly and deprecated onto the property", () => {
    const { node } = lowerOne({
      type: "object",
      properties: { a: { type: "string", readOnly: true, deprecated: true } },
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]).toMatchObject({ readOnly: true, deprecated: true });
  });

  it("records additionalProperties: false as forbidden", () => {
    const { node } = lowerOne({ type: "object", properties: { a: true }, additionalProperties: false });
    expect(node).toMatchObject({ additional: { kind: "forbidden" } });
  });

  it("infers object from properties with no declared type", () => {
    expect(lowerOne({ properties: { a: { type: "string" } } }).node.kind).toBe("object");
  });

  it("turns dependentRequired into a readable note", () => {
    const { node } = lowerOne({
      type: "object",
      properties: { a: true, b: true },
      dependentRequired: { a: ["b"] },
    });
    expect(node.docs.notes).toEqual(["If `a` is present, `b` is required."]);
  });
});

describe("lower — arrays and tuples", () => {
  it("lowers items into an array node", () => {
    const { node } = lowerOne({ type: "array", items: { type: "string" }, minItems: 1 });
    expect(node).toMatchObject({ kind: "array", items: { kind: "string" }, constraints: { minItems: 1 } });
  });

  it("treats an array with no items as an array of any", () => {
    expect(lowerOne({ type: "array" }).node).toMatchObject({ kind: "array", items: { kind: "any" } });
  });

  it("lowers prefixItems into a tuple, with items as the rest", () => {
    const { node } = lowerOne({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: false,
    });
    expect(node).toMatchObject({
      kind: "tuple",
      prefixItems: [{ kind: "string" }, { kind: "number" }],
      rest: { kind: "forbidden" },
    });
  });
});

describe("lower — composition", () => {
  it("merges allOf of objects, recording refs as composedFrom", () => {
    const doc = { $defs: { Base: { type: "object", properties: { id: { type: "string" } } } } };
    const { node } = lowerOne(
      {
        allOf: [{ $ref: "#/$defs/Base" }, { type: "object", properties: { name: { type: "string" } } }],
      },
      "json-schema",
      doc,
    );
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties.map((p) => p.name)).toEqual(["name"]);
    expect(node.composedFrom).toEqual(["d#/$defs/Base"]);
  });

  it("merges two inline objects into one", () => {
    const { node } = lowerOne({
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "string" } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties.map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("falls back to intersection with a diagnostic when members cannot merge", () => {
    const { node, diagnostics } = lowerOne({
      allOf: [{ type: "string" }, { type: "object", properties: { a: true } }],
    });
    expect(node.kind).toBe("intersection");
    expect(diagnostics.map((d) => d.code)).toContain("ALLOF_UNMERGED");
  });

  it("flags conflicting property definitions rather than guessing silently", () => {
    const { diagnostics } = lowerOne({
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { a: { type: "number" } } },
      ],
    });
    expect(diagnostics.map((d) => d.code)).toContain("ALLOF_CONFLICT");
  });

  it("merges keywords sitting alongside allOf", () => {
    const { node } = lowerOne({
      allOf: [{ type: "object", properties: { a: { type: "string" } } }],
      properties: { b: { type: "string" } },
      type: "object",
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties.map((p) => p.name)).toEqual(["a", "b"]);
  });
});

describe("lower — unions", () => {
  it("labels variants from an explicit discriminator mapping", () => {
    const doc = {
      $defs: { Cat: { type: "object", properties: { t: { const: "cat" } } }, Dog: { type: "object", properties: { t: { const: "dog" } } } },
    };
    const { node } = lowerOne(
      {
        oneOf: [{ $ref: "#/$defs/Cat" }, { $ref: "#/$defs/Dog" }],
        discriminator: { propertyName: "t", mapping: { feline: "#/$defs/Cat", canine: "#/$defs/Dog" } },
      },
      "json-schema",
      doc,
    );
    if (node.kind !== "union") throw new Error("expected union");
    expect(node.variants.map((v) => [v.label, v.labelSource])).toEqual([
      ["feline", "discriminator"],
      ["canine", "discriminator"],
    ]);
    expect(node.discriminator).toEqual({ propertyName: "t", inferred: false });
  });

  it("falls back through title, then ref name, then index", () => {
    const doc = { $defs: { Named: { type: "object", properties: { a: true } } } };
    const { node } = lowerOne(
      {
        anyOf: [
          { title: "By title", type: "object", properties: { a: true } },
          { $ref: "#/$defs/Named" },
          { type: "object", properties: { b: true } },
        ],
      },
      "json-schema",
      doc,
    );
    if (node.kind !== "union") throw new Error("expected union");
    expect(node.variants.map((v) => v.labelSource)).toEqual(["title", "ref", "index"]);
    expect(node.variants[2]?.label).toBe("Option 3");
  });

  it("records anyOf as atLeastOne and oneOf as exactlyOne", () => {
    const two = [{ type: "string" }, { type: "number" }];
    expect(lowerOne({ anyOf: two }).node).toMatchObject({ mode: "atLeastOne" });
    expect(lowerOne({ oneOf: two }).node).toMatchObject({ mode: "exactlyOne" });
  });
});

describe("lower — keywords sitting alongside a union", () => {
  // The same rule as allOf: every keyword present applies at once. Returning
  // the union alone discards the rest, which is silent data loss.
  it("folds required-only branches into a note on the object they describe", () => {
    const { node, diagnostics } = lowerOne({
      type: "object",
      properties: { state: { type: "string" }, assignees: { type: "string" } },
      anyOf: [{ required: ["state"] }, { required: ["assignees"] }],
    });
    expect(node.kind).toBe("object");
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties.map((p) => p.name)).toEqual(["state", "assignees"]);
    expect(node.docs.notes).toEqual(["At least one of these is required: `state`, `assignees`."]);
    expect(diagnostics).toEqual([]);
  });

  it("says `exactly one` for oneOf and groups a multi-name branch", () => {
    const { node } = lowerOne({
      properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
      oneOf: [{ required: ["a", "b"] }, { required: ["c"] }],
    });
    expect(node.docs.notes).toEqual([
      "Exactly one of these is required: `a` and `b`, `c`.",
    ]);
  });

  it("intersects when the branches carry real structure of their own", () => {
    const { node, diagnostics } = lowerOne({
      type: "object",
      properties: { name: { type: "string" } },
      anyOf: [
        { properties: { kind: { const: "a" } }, required: ["kind"] },
        { properties: { other: { type: "number" } } },
      ],
    });
    expect(node.kind).toBe("intersection");
    if (node.kind !== "intersection") throw new Error("expected intersection");
    expect(node.members[0]).toMatchObject({ kind: "object" });
    expect(node.members[1]).toMatchObject({ kind: "union" });
    expect(diagnostics.map((d) => d.code)).toEqual(["UNION_WITH_SIBLINGS"]);
  });

  it("keeps additionalProperties: false, which the branches do not imply", () => {
    const { node } = lowerOne({
      type: "object",
      additionalProperties: false,
      oneOf: [{ properties: { a: {} } }, { properties: { b: {} } }],
    });
    expect(node.kind).toBe("intersection");
  });

  it("ignores a bare `type` that only agrees with the branches", () => {
    const { node, diagnostics } = lowerOne({
      type: "object",
      oneOf: [{ properties: { a: { type: "string" } } }, { properties: { b: {} } }],
    });
    expect(node.kind).toBe("union");
    expect(diagnostics).toEqual([]);
  });

  it("ignores documentation, which is not a sibling constraint", () => {
    const { node } = lowerOne({
      description: "pick one",
      anyOf: [{ type: "string" }, { type: "number" }],
    });
    expect(node.kind).toBe("union");
    expect(node.docs.description).toBe("pick one");
  });

  it("keeps OAS 3.0 nullability, which belongs to the union itself", () => {
    const { node } = lowerOne(
      { nullable: true, anyOf: [{ type: "string" }, { type: "number" }] },
      "openapi-3.0",
    );
    expect(node.kind).toBe("union");
    expect(node.nullable).toBe(true);
  });

  it("still intersects when a nullable schema has properties of its own", () => {
    const { node } = lowerOne(
      {
        type: "object",
        nullable: true,
        properties: { name: { type: "string" } },
        oneOf: [{ properties: { a: {} } }, { properties: { b: {} } }],
      },
      "openapi-3.0",
    );
    expect(node.kind).toBe("intersection");
    expect(node.nullable).toBe(true);
  });

  it("leaves a plain union alone", () => {
    const { node, diagnostics } = lowerOne({ anyOf: [{ type: "string" }, { type: "number" }] });
    expect(node.kind).toBe("union");
    expect(diagnostics).toEqual([]);
  });
});

describe("lower — lossy, but never silently", () => {
  it.each([
    ["if", { if: { type: "string" }, then: true }],
    ["not", { not: { type: "string" } }],
    ["dependentSchemas", { dependentSchemas: { a: true } }],
    ["unevaluatedProperties", { unevaluatedProperties: false }],
    ["$dynamicRef", { $dynamicRef: "#meta" }],
  ])("turns %s into an unsupported node plus a diagnostic", (_name, schema) => {
    const { node, diagnostics } = lowerOne(schema);
    expect(node.kind).toBe("unsupported");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("warning");
  });

  it("keeps a best-effort partial lowering of the parts it did understand", () => {
    const { node } = lowerOne({
      type: "object",
      properties: { a: { type: "string" } },
      not: { type: "null" },
    });
    if (node.kind !== "unsupported") throw new Error("expected unsupported");
    expect(node.partial).toMatchObject({ kind: "object" });
    expect(node.raw).toBeDefined();
  });

  it("reports an unresolved ref rather than crashing", () => {
    const { node, diagnostics } = lowerOne({ $ref: "#/$defs/Missing" });
    expect(node.kind).toBe("unsupported");
    expect(diagnostics[0]?.code).toBe("UNRESOLVED_REF");
    expect(diagnostics[0]?.severity).toBe("error");
  });
});

describe("lower — $ref siblings are usage docs", () => {
  it("keeps a description beside a $ref on the node, not on the type", () => {
    const doc = { $defs: { Language: { type: "string", description: "A language." } } };
    const { node, schemas } = lowerOne(
      { type: "object", properties: { lang: { $ref: "#/$defs/Language", description: "This use." } } },
      "json-schema",
      doc,
    );
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]?.docs.description).toBe("This use.");
    expect(schemas["d#/$defs/Language"]?.docs.description).toBe("A language.");
  });
});

describe("registry", () => {
  it("terminates on a self-referential type", () => {
    const doc = {
      $defs: { Tree: { type: "object", properties: { child: { $ref: "#/$defs/Tree" } } } },
    };
    const h = harness(doc);
    h.lower({ $ref: "#/$defs/Tree" });
    const { schemas } = h.finish();
    expect(Object.keys(schemas)).toEqual(["d#/$defs/Tree"]);
    const tree = schemas["d#/$defs/Tree"]!;
    if (tree.node.kind !== "object") throw new Error("expected object");
    expect(tree.node.properties[0]?.node).toMatchObject({ kind: "ref", target: "d#/$defs/Tree" });
  });

  it("gives one id to a type however many times it is referenced", () => {
    const doc = { $defs: { A: { type: "string" } } };
    const h = harness(doc);
    h.lower({ type: "object", properties: { x: { $ref: "#/$defs/A" }, y: { $ref: "#/$defs/A" } } });
    expect(Object.keys(h.finish().schemas)).toEqual(["d#/$defs/A"]);
  });

  it("assigns slugs over the whole registry, breaking collisions", () => {
    const doc = { $defs: { Job: { title: "Job", type: "string" }, Other: { title: "Job", type: "number" } } };
    const h = harness(doc);
    h.lower({ anyOf: [{ $ref: "#/$defs/Job" }, { $ref: "#/$defs/Other" }] });
    const slugs = Object.values(h.finish().schemas).map((d) => d.slug);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs.sort()).toEqual(["job", "job-2"]);
  });

  it("names a type from its title, falling back to the pointer segment", () => {
    const doc = { $defs: { Untitled: { type: "string" }, Titled: { title: "Nice Name", type: "string" } } };
    const h = harness(doc);
    h.lower({ anyOf: [{ $ref: "#/$defs/Untitled" }, { $ref: "#/$defs/Titled" }] });
    const names = Object.values(h.finish().schemas).map((d) => d.name).sort();
    expect(names).toEqual(["Nice Name", "Untitled"]);
  });
});

describe("lower — allOf intersects rather than overwrites", () => {
  // Found against the real GitHub description, where members routinely restate
  // a property to refine it. Overwriting discarded the tighter constraint.
  it("keeps the more specific constraint when a later member omits it", () => {
    const { node, diagnostics } = lowerOne({
      allOf: [
        { type: "object", properties: { url: { type: "string", format: "uri" } } },
        { type: "object", properties: { url: { type: "string" } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]?.node).toMatchObject({
      kind: "string",
      constraints: { format: "uri" },
    });
    expect(diagnostics).toEqual([]);
  });

  it("unions the constraints of both members", () => {
    const { node } = lowerOne({
      allOf: [
        { type: "object", properties: { a: { type: "string", minLength: 1 } } },
        { type: "object", properties: { a: { type: "string", maxLength: 9 } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]?.node).toMatchObject({
      constraints: { minLength: 1, maxLength: 9 },
    });
  });

  it("treats required in either member as required in the whole", () => {
    const { node } = lowerOne({
      allOf: [
        { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        { type: "object", properties: { a: { type: "string" } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]?.required).toBe(true);
  });

  it("merges nested objects rather than replacing them", () => {
    const { node } = lowerOne({
      allOf: [
        { type: "object", properties: { nested: { type: "object", properties: { a: { type: "string" } } } } },
        { type: "object", properties: { nested: { type: "object", properties: { b: { type: "string" } } } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    const nested = node.properties[0]?.node;
    if (nested?.kind !== "object") throw new Error("expected nested object");
    expect(nested.properties.map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("intersects enum members", () => {
    const { node } = lowerOne({
      allOf: [
        { type: "object", properties: { a: { enum: ["x", "y", "z"] } } },
        { type: "object", properties: { a: { enum: ["y", "z", "w"] } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    const a = node.properties[0]?.node;
    if (a?.kind !== "enum") throw new Error("expected enum");
    expect(a.members.map((m) => m.value)).toEqual(["y", "z"]);
  });

  it("lets a bare `any` member yield to the more specific one", () => {
    const { node, diagnostics } = lowerOne({
      allOf: [
        { type: "object", properties: { a: {} } },
        { type: "object", properties: { a: { type: "string", minLength: 2 } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]?.node).toMatchObject({ kind: "string", constraints: { minLength: 2 } });
    expect(diagnostics).toEqual([]);
  });

  it("still reports a genuine kind clash and keeps the first", () => {
    const { node, diagnostics } = lowerOne({
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { a: { type: "number" } } },
      ],
    });
    if (node.kind !== "object") throw new Error("expected object");
    expect(node.properties[0]?.node.kind).toBe("string");
    expect(diagnostics.map((d) => d.code)).toEqual(["ALLOF_CONFLICT"]);
  });
});
