/**
 * The two promises this package makes about its output: these class names and
 * no others, and no styling of any kind.
 *
 * Both are checked against real rendered output rather than by reading the
 * source, because the promise is about what reaches the page.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { ApiIR } from "@speculoos/core";
import { CLASSES, INTEROP_CLASSES, classNames, renderApi, renderNav, renderTypes } from "../src/index.js";
import { classesIn, restIR, tagsIn, wsIR } from "./ir.js";

let rest: ApiIR;
let ws: ApiIR;
let everything: string;

beforeAll(async () => {
  rest = await restIR();
  ws = await wsIR("realtime-v3.yaml");
  // Every entry point, over both dialects, so the class sweep sees the lot.
  everything = [
    renderApi(rest),
    renderApi(ws),
    renderNav(rest),
    renderNav(ws, { groupBy: "none" }),
    renderNav(rest, { groupBy: "tag" }),
    renderApi(rest, { groupBy: "tag" }),
    renderTypes(rest),
    renderApi(rest, { layout: "rows" }),
  ].join("\n");
});

describe("the class-name contract", () => {
  it("emits nothing that is not in the catalogue", () => {
    const documented = new Set(classNames("spec"));
    const undocumented = classesIn(everything).filter((c) => !documented.has(c));
    expect(undocumented).toEqual([]);
  });

  it("honours classPrefix on every class but the interop ones", () => {
    const html = renderApi(rest, { classPrefix: "sm" });
    const interop = new Set(INTEROP_CLASSES);
    expect(classesIn(html).filter((c) => !c.startsWith("sm-") && !interop.has(c))).toEqual([]);
    expect(html).not.toContain("spec-");
  });

  it("leaves the highlighter conventions unprefixed", () => {
    // `language-json` is what Prism and highlight.js look for. Prefixing it
    // would mean no example payload ever gets highlighted.
    // The AsyncAPI fixture is the one carrying an example payload.
    expect(renderApi(ws, { classPrefix: "sm" })).toContain('class="language-json"');
  });

  it("documents a block for every modifier list", () => {
    // A modifier with no block would be unreachable; a duplicate would make the
    // catalogue lie about how many names there are.
    for (const [block, modifiers] of Object.entries(CLASSES)) {
      expect(new Set(modifiers).size, block).toBe(modifiers.length);
    }
  });
});

describe("no styling", () => {
  it("emits no style attribute and no style element", () => {
    expect(everything).not.toMatch(/ style="/);
    expect(tagsIn(everything)).not.toContain("style");
  });

  it("emits no script", () => {
    // The group component is the static stand-in for tabs precisely so that
    // nothing here needs script to be readable.
    expect(tagsIn(everything)).not.toContain("script");
  });

  it("uses only ordinary semantic elements", () => {
    const allowed = new Set([
      "a",
      "code",
      "div",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "header",
      "li",
      "nav",
      "p",
      "pre",
      "section",
      "span",
      "ul",
    ]);
    expect(tagsIn(everything).filter((t) => !allowed.has(t))).toEqual([]);
  });
});

describe("well-formed", () => {
  const VOID = new Set(["br", "hr", "img", "input", "link", "meta", "source", "wbr"]);

  /** Unbalanced or mis-nested tags, as a tag-stack walk reports them. */
  function imbalance(html: string): string[] {
    const stack: string[] = [];
    const errors: string[] = [];
    for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)[^>]*?(\/?)>/gi)) {
      const [, closing, tag, selfClosing] = m;
      const name = (tag ?? "").toLowerCase();
      if (VOID.has(name) || selfClosing === "/") continue;
      if (closing === "/") {
        if (stack.pop() !== name) errors.push(`unexpected </${name}>`);
      } else {
        stack.push(name);
      }
    }
    return [...errors, ...stack.map((t) => `unclosed <${t}>`)];
  }

  it("closes every element it opens", () => {
    // A string renderer has no DOM to catch this. One missing </div> in a
    // branch nobody renders in the fixtures would corrupt a whole page.
    expect(imbalance(everything)).toEqual([]);
  });

  it("would notice if it did not", () => {
    expect(imbalance("<div><span></div>")).not.toEqual([]);
  });
});
