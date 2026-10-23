import { describe, expect, it } from "vitest";
import { upcast } from "../src/index.js";

describe("upcast — OpenAPI 3.0", () => {
  it("turns nullable into a null type member", () => {
    expect(upcast({ type: "string", nullable: true }, "openapi-3.0")).toEqual({
      type: ["string", "null"],
    });
  });

  it("leaves nullable: false alone", () => {
    expect(upcast({ type: "string", nullable: false }, "openapi-3.0")).toEqual({
      type: "string",
    });
  });

  it("converts boolean exclusive bounds to the numeric form", () => {
    expect(
      upcast({ type: "number", minimum: 0, exclusiveMinimum: true }, "openapi-3.0"),
    ).toEqual({ type: "number", exclusiveMinimum: 0 });
  });

  it("drops a boolean exclusiveMinimum that is false", () => {
    expect(
      upcast({ type: "number", minimum: 0, exclusiveMinimum: false }, "openapi-3.0"),
    ).toEqual({ type: "number", minimum: 0 });
  });

  it("promotes singular example to examples", () => {
    expect(upcast({ type: "string", example: "en" }, "openapi-3.0")).toEqual({
      type: "string",
      examples: ["en"],
    });
  });
});

describe("upcast — draft-07 (AsyncAPI 2.x)", () => {
  it("renames definitions to $defs", () => {
    const out = upcast({ definitions: { A: { type: "string" } } }, "asyncapi-2") as Record<string, unknown>;
    expect(out["$defs"]).toEqual({ A: { type: "string" } });
    expect(out["definitions"]).toBeUndefined();
  });

  it("converts tuple-style items to prefixItems and additionalItems to items", () => {
    expect(
      upcast({ items: [{ type: "string" }], additionalItems: { type: "number" } }, "asyncapi-2"),
    ).toEqual({ prefixItems: [{ type: "string" }], items: { type: "number" } });
  });

  it("splits dependencies into dependentRequired and dependentSchemas", () => {
    const out = upcast(
      { dependencies: { a: ["b"], c: { type: "string" } } },
      "asyncapi-2",
    ) as Record<string, unknown>;
    expect(out["dependentRequired"]).toEqual({ a: ["b"] });
    expect(out["dependentSchemas"]).toEqual({ c: { type: "string" } });
  });

  it("expands a string discriminator into the object form", () => {
    expect(upcast({ discriminator: "messageType" }, "asyncapi-2")).toMatchObject({
      discriminator: { propertyName: "messageType" },
    });
  });
});

describe("upcast — instance data is never rewritten", () => {
  it("leaves a `nullable` key inside an example alone", () => {
    // An example payload may contain any field names at all, including ones
    // that happen to be schema keywords. Recursing into it would corrupt them.
    const out = upcast(
      { type: "object", example: { nullable: true, items: [1, 2] } },
      "openapi-3.0",
    ) as Record<string, unknown>;
    expect(out["examples"]).toEqual([{ nullable: true, items: [1, 2] }]);
  });

  it("leaves enum and const values alone", () => {
    expect(upcast({ enum: [{ nullable: true }], const: { items: [] } }, "openapi-3.0")).toEqual({
      enum: [{ nullable: true }],
      const: { items: [] },
    });
  });

  it("recurses into nested subschemas", () => {
    expect(
      upcast(
        { type: "object", properties: { a: { type: "string", nullable: true } } },
        "openapi-3.0",
      ),
    ).toEqual({ type: "object", properties: { a: { type: ["string", "null"] } } });
  });
});
