/**
 * Not an assertion test so much as a legibility check: render the fixture the
 * way a docs site would, and read it. If the IR is missing something a renderer
 * needs, it shows up here as a blank column or a nonsense label.
 */
import { describe, it } from "vitest";
import { allOperations, collectLinks, type FieldNode, toRows } from "../src/index.js";
import { ir, jobRef, messageRef } from "./fixture.js";

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length));

function table(rows: FieldNode[]): string {
  const line = (f: FieldNode) => {
    const indent = "  ".repeat(f.depth);
    const name = f.name === undefined ? "(root)" : f.name;
    const req = f.required ? "*" : " ";
    const tail =
      f.children.kind === "link"
        ? `  → ${f.children.target.split("/").pop()}`
        : f.children.kind === "cycle"
          ? `  ↻ ${f.children.target.split("/").pop()}`
          : f.children.kind === "variants"
            ? `  (${f.children.label})`
            : "";
    return [
      pad(indent + name + req, 34),
      pad(f.typeLabel, 26),
      pad(f.chips.map((c) => c.label).join(", "), 38),
      (f.docs.description ?? "") + tail,
    ].join("");
  };
  return rows.map(line).join("\n");
}

describe("preview", () => {
  it("renders the fixture", () => {
    const out: string[] = [];

    out.push(`── Navigation ${"─".repeat(66)}`);
    for (const { endpoint, operation } of allOperations(ir)) {
      const label =
        operation.kind === "request-response"
          ? `${operation.method.toUpperCase()} ${endpoint.address}`
          : `${operation.direction === "client-sends" ? "→" : "←"} ${endpoint.address} ${operation.id}`;
      out.push(`  ${pad(label, 30)} tags: ${operation.tags.join(", ") || "—"}`);
    }

    out.push(`\n── Job, default policy (named types link out) ${"─".repeat(35)}`);
    out.push(table(toRows(jobRef, ir)));
    out.push(
      "  must also emit: " +
        collectLinks(toRows(jobRef, ir)[0]!)
          .map((t) => t.split("/").pop())
          .join(", "),
    );

    out.push(`\n── Job, fully expanded, response view ${"─".repeat(43)}`);
    out.push(table(toRows(jobRef, ir, { expandRefs: "always", view: "response" })));

    out.push(`\n── Message, a discriminated union ${"─".repeat(47)}`);
    out.push(table(toRows(messageRef, ir, { expandRefs: "always" })));

    console.log(`\n${out.join("\n")}\n`);
  });
});
