/**
 * The two renderers, over the same IR.
 *
 * This is the test M5 exists for. Two renderers that happen to agree because
 * they share a code path prove nothing; these two share only `@speculoos/core`,
 * and one of them has no components, no hooks and no DOM at all. If `FieldNode`
 * were quietly React-shaped — if some decision had been left to the React
 * package that the IR should have made — the string renderer would show fewer
 * fields, or different links, and these assertions would fail.
 *
 * It lives in this package rather than in `@speculoos/html` only because React
 * is the heavier dependency of the two: pulling `@speculoos/html` in here costs
 * nothing, and pulling React into there would have cost five packages.
 *
 * What it compares is *content*, never markup. Markup differing is the point.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { allOperations, type ApiIR, type OperationEntry } from "@speculoos/core";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { buildAsyncApi } from "@speculoos/asyncapi";
import { renderEndpoint, renderNav, renderOperation, renderTypes } from "@speculoos/html";
import { Endpoint, EntryList, Operation, SpeculoosProvider, TypeSections } from "../src/index.js";
import { boxy } from "./fake.js";

let rest: ApiIR;
let ws: ApiIR;

beforeAll(async () => {
  rest = buildOpenApi({
    project: await load({ root: specDir, documents: [{ name: "batch", path: "batch.yaml" }] }),
  });
  ws = buildAsyncApi({
    project: await load({ root: specDir, documents: [{ name: "rt", path: "realtime-v3.yaml" }] }),
  });
});

/** `data-key` is emitted by both: the fake `FieldRow` and the `<li>`. */
const keys = (html: string): Set<string> =>
  new Set([...html.matchAll(/data-key="([^"]*)"/g)].map((m) => m[1] ?? ""));

/** `data-href` from the fake `Link`; `href` from the real `<a>`. */
const hrefs = (html: string): Set<string> =>
  new Set([...html.matchAll(/(?:data-)?href="([^"]*)"/g)].map((m) => m[1] ?? ""));

function viaReact(ir: ApiIR, node: React.ReactNode): string {
  return renderToStaticMarkup(
    <SpeculoosProvider ir={ir} components={boxy}>
      {node}
    </SpeculoosProvider>,
  );
}

function bothWays(ir: ApiIR, entry: OperationEntry): { react: string; html: string } {
  return {
    react: viaReact(ir, <Operation endpoint={entry.endpoint} operation={entry.operation} />),
    html: renderOperation(entry, ir),
  };
}

describe("the same operations, two renderers", () => {
  it("shows the same fields in every REST operation", () => {
    for (const entry of allOperations(rest)) {
      const { react, html } = bothWays(rest, entry);
      expect(keys(html), entry.operation.id).toEqual(keys(react));
    }
  });

  it("shows the same fields in every message operation", () => {
    for (const entry of allOperations(ws)) {
      const { react, html } = bothWays(ws, entry);
      expect(keys(html), entry.operation.id).toEqual(keys(react));
    }
  });

  it("links to the same places", () => {
    for (const entry of allOperations(rest)) {
      const { react, html } = bothWays(rest, entry);
      expect(hrefs(html), entry.operation.id).toEqual(hrefs(react));
    }
  });

  it("finds no field at all in neither or both", () => {
    // Guards the assertions above against passing by comparing two empty sets
    // for every operation.
    const total = allOperations(rest).reduce(
      (n, entry) => n + keys(bothWays(rest, entry).html).size,
      0,
    );
    expect(total).toBeGreaterThan(20);
  });
});

describe("the same endpoints, two renderers", () => {
  it("shows the same fields and links in every endpoint of both dialects", () => {
    for (const ir of [rest, ws]) {
      for (const endpoint of ir.endpoints) {
        const react = viaReact(ir, <Endpoint endpoint={endpoint} />);
        const html = renderEndpoint(endpoint, ir);
        expect(keys(html), endpoint.id).toEqual(keys(react));
        expect(hrefs(html), endpoint.id).toEqual(hrefs(react));
      }
    }
  });

  it("navigates to the same places", () => {
    for (const ir of [rest, ws]) {
      expect(hrefs(renderNav(ir))).toEqual(hrefs(viaReact(ir, <EntryList />)));
    }
  });
});

describe("the same type sections, two renderers", () => {
  it("shows the same fields across the whole registry", () => {
    const react = viaReact(rest, <TypeSections />);
    const html = renderTypes(rest);
    expect(keys(html)).toEqual(keys(react));
  });

  it("gives every named type the same anchor", () => {
    const react = viaReact(rest, <TypeSections />);
    const html = renderTypes(rest);
    const ids = (s: string): Set<string> =>
      new Set([...s.matchAll(/ id="([^"]*)"/g)].map((m) => m[1] ?? ""));
    expect(ids(html)).toEqual(ids(react));
  });
});

describe("the markup is not the same", () => {
  it("shares no element name between the two renderers", () => {
    // If this ever passes trivially, one of the renderers has stopped being an
    // independent implementation and the parity assertions above lose meaning.
    const entry = allOperations(rest)[0]!;
    const { react, html } = bothWays(rest, entry);
    const tags = (s: string): Set<string> =>
      new Set([...s.matchAll(/<([a-z][a-z0-9-]*)/gi)].map((m) => (m[1] ?? "").toLowerCase()));
    const shared = [...tags(html)].filter((t) => tags(react).has(t));
    expect(shared).toEqual([]);
  });
});
