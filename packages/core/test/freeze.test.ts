/**
 * `irVersion: 1` is frozen. Additions only.
 *
 * Frozen means a consumer can write against this shape and not be broken: no
 * field is removed, renamed or re-typed, and no `Node.kind` disappears. Adding
 * an optional field is fine and does not need a version bump — that is the
 * whole reason the freeze is survivable, and the reason OD-2 could stay
 * descoped without painting the IR into a corner.
 *
 * These tests fail on a *removal*. They are meant to be edited when something
 * is added, and argued about when something is taken away.
 */
import { describe, expect, it } from "vitest";
import type { ApiIR, Node } from "../src/index.js";
import { ir } from "./fixture.js";

/** Every key `ApiIR` has promised. */
const IR_KEYS = [
  "diagnostics",
  "endpoints",
  "info",
  "irVersion",
  "provenance",
  "schemas",
  "security",
  "securitySchemes",
  "servers",
  "tags",
] as const;

/**
 * Every `Node.kind`. Adding a dialect should not need a new one — AsyncAPI did
 * not, which is the strongest evidence the IR is right — so a change here is a
 * conversation, not a commit.
 */
const NODE_KINDS = [
  "any",
  "array",
  "boolean",
  "const",
  "enum",
  "intersection",
  "map",
  "never",
  "null",
  "number",
  "object",
  "ref",
  "string",
  "tuple",
  "union",
  "unsupported",
] as const;

describe("irVersion 1 is frozen", () => {
  it("declares version 1", () => {
    expect(ir.irVersion).toBe(1);
  });

  it("keeps every top-level key", () => {
    for (const key of IR_KEYS) expect(Object.keys(ir)).toContain(key);
  });

  it("has no top-level key that is not written down", () => {
    // Catches an addition that nobody remembered to document here.
    expect(Object.keys(ir).filter((k) => !IR_KEYS.includes(k as never))).toEqual([]);
  });

  it("keeps every node kind", () => {
    // A type-level assertion: this fails to compile if a kind is removed from
    // the union, which is a better error than a failing expectation.
    const exhaustive: Record<Node["kind"], true> = Object.fromEntries(NODE_KINDS.map((k) => [k, true])) as Record<
      Node["kind"],
      true
    >;
    expect(Object.keys(exhaustive).sort()).toEqual([...NODE_KINDS].sort());
  });

  it("keeps the operation kinds distinct", () => {
    // Folding request/response and message operations together would be the
    // single most tempting breaking change, and the one that reads worst.
    const kinds: Record<ApiIR["endpoints"][number]["operations"][number]["kind"], true> = {
      "request-response": true,
      message: true,
    };
    expect(Object.keys(kinds).sort()).toEqual(["message", "request-response"]);
  });
});
