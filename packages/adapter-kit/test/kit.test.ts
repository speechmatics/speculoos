import { describe, expect, it } from "vitest";
import type { Diagnostic, SourceLocation } from "@speculoos/core";
import {
  deref,
  docsOf,
  extensionsOf,
  optional,
  protocolOf,
  refName,
  securityFromMaps,
  type AdapterContext,
} from "../src/index.js";

/** A one-document project, resolving same-document pointers only. */
function ctxFor(doc: Record<string, unknown>) {
  const diagnostics: Diagnostic[] = [];
  const at = (pointer: string): unknown => {
    if (pointer === "") return doc;
    let current: unknown = doc;
    for (const raw of pointer.split("/").slice(1)) {
      const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };
  const ctx: AdapterContext = {
    document: "d",
    project: {
      resolve: (ref, from) =>
        ref.startsWith("#") && at(ref.slice(1)) !== undefined
          ? { document: from.document, pointer: ref.slice(1) }
          : undefined,
      at: (loc) => at(loc.pointer),
    },
    report: (d) => diagnostics.push(d),
  };
  return { ctx, diagnostics };
}

const loc = (pointer: string): SourceLocation => ({ document: "d", pointer });

describe("deref", () => {
  it("returns a plain value untouched", () => {
    const { ctx } = ctxFor({});
    expect(deref(ctx, { a: 1 }, loc("/x"))).toEqual({ value: { a: 1 }, source: loc("/x") });
  });

  it("follows a ref and reports where the value actually lives", () => {
    const { ctx } = ctxFor({ components: { parameters: { id: { name: "id" } } } });
    const out = deref(ctx, { $ref: "#/components/parameters/id" }, loc("/paths/x"));
    expect(out.value).toEqual({ name: "id" });
    // The caller must use `source`, not a pointer it built itself — the target
    // may be in another document entirely.
    expect(out.source.pointer).toBe("/components/parameters/id");
  });

  it("follows a chain of refs", () => {
    const { ctx } = ctxFor({ a: { $ref: "#/b" }, b: { $ref: "#/c" }, c: { done: true } });
    expect(deref(ctx, { $ref: "#/a" }, loc("/x")).value).toEqual({ done: true });
  });

  it("reports an unresolvable ref rather than throwing", () => {
    const { ctx, diagnostics } = ctxFor({});
    expect(deref(ctx, { $ref: "#/nope" }, loc("/x")).value).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ severity: "error", code: "UNRESOLVED_REF" });
  });

  it("terminates on a ref cycle", () => {
    const { ctx, diagnostics } = ctxFor({ a: { $ref: "#/b" }, b: { $ref: "#/a" } });
    expect(deref(ctx, { $ref: "#/a" }, loc("/x")).value).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toContain("REF_CYCLE");
  });
});

describe("docsOf", () => {
  it("prefers summary over title for the short line", () => {
    expect(docsOf({ summary: "Short", title: "Also short", description: "Long." })).toMatchObject({
      title: "Short",
      description: "Long.",
    });
  });

  it("falls back to title when there is no summary", () => {
    expect(docsOf({ title: "A title" }).title).toBe("A title");
  });

  it("does not repeat the description as the title", () => {
    expect(docsOf({ description: "Only this." })).toEqual({ description: "Only this." });
  });

  it("keeps descriptions as CommonMark, never pre-rendered", () => {
    // Specs are untrusted input. Sanitising is the renderer's job, and doing it
    // here would silently change what the spec author wrote.
    const raw = "**bold** <img src=x onerror=alert(1)>";
    expect(docsOf({ description: raw }).description).toBe(raw);
  });

  it("carries externalDocs and deprecated", () => {
    expect(
      docsOf({ deprecated: true, externalDocs: { url: "https://x", description: "More" } }),
    ).toMatchObject({ deprecated: true, externalDocs: { url: "https://x", description: "More" } });
  });

  it("returns nothing for a non-object", () => {
    expect(docsOf(undefined)).toEqual({});
    expect(docsOf("string")).toEqual({});
  });
});

describe("extensionsOf", () => {
  it("passes x-* keys through untouched", () => {
    expect(extensionsOf({ "x-internal": true, "x-order": 3, name: "n" })).toEqual({
      extensions: { "x-internal": true, "x-order": 3 },
    });
  });

  it("omits the key entirely when there are none", () => {
    expect(extensionsOf({ name: "n" })).toEqual({});
  });
});

describe("securityFromMaps", () => {
  it("reads outer entries as OR and inner as AND", () => {
    expect(securityFromMaps([{ a: [], b: ["read"] }, { c: [] }])).toEqual([
      [
        { scheme: "a", scopes: [] },
        { scheme: "b", scopes: ["read"] },
      ],
      [{ scheme: "c", scopes: [] }],
    ]);
  });

  it("returns nothing for a missing or malformed value", () => {
    expect(securityFromMaps(undefined)).toEqual([]);
    expect(securityFromMaps("nope")).toEqual([]);
  });
});

describe("protocolOf", () => {
  it("reads the scheme from a url", () => {
    expect(protocolOf("wss://example.com/v2")).toBe("wss");
    expect(protocolOf("HTTPS://example.com")).toBe("https");
  });

  it("falls back for a templated url with no scheme", () => {
    expect(protocolOf("{host}/v2")).toBe("https");
    expect(protocolOf("{host}/v2", "wss")).toBe("wss");
  });
});

describe("refName", () => {
  it("takes the last segment and unescapes it", () => {
    expect(refName("#/components/schemas/Job")).toBe("Job");
    expect(refName("./common.yaml#/components/schemas/Language")).toBe("Language");
    expect(refName("#/channels/~1v2~1{language}")).toBe("/v2/{language}");
  });
});

describe("optional", () => {
  it("omits absent values so exactOptionalPropertyTypes holds", () => {
    expect({ ...optional("a", undefined), ...optional("b", 1) }).toEqual({ b: 1 });
    expect("a" in { ...optional("a", undefined) }).toBe(false);
  });

  it("keeps values that are falsy but present", () => {
    expect(optional("a", 0)).toEqual({ a: 0 });
    expect(optional("a", "")).toEqual({ a: "" });
  });
});
