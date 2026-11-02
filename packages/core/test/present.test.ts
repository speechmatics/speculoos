import { describe, expect, it } from "vitest";
import type { Node } from "../src/index.js";
import { collectLinks, type FieldNode, projectForView, toRows, toTree, typeLabel } from "../src/index.js";
import { arr, enumNode, ids, ir, jobRef, messageRef, obj, prop, ref, str, treeRef } from "./fixture.js";

const find = (rows: FieldNode[], path: string) => rows.find((r) => r.path.join("/") === path);

describe("toTree — expansion policy", () => {
  it("links to named types by default, keeping tables shallow", () => {
    const rows = toRows(jobRef, ir);
    expect(find(rows, "config")?.children).toEqual({
      kind: "link",
      target: ids("TranscriptionConfig"),
      reason: "named",
    });
  });

  it("expands refs when asked, reaching through to nested properties", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    const language = find(rows, "config/language");
    // Labelled by its type name, not its underlying primitive — that is the
    // point of having a registry.
    expect(language?.typeLabel).toBe("Language");
    expect(language?.typeRef).toBe(ids("Language"));
  });

  it("expands the root even under the default link-everything policy", () => {
    // A `$ref`-valued request body is the common case; linking the root back to
    // itself would render an empty table.
    const rows = toRows(jobRef, ir);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.children.kind).toBe("inline");
  });

  it("stops at maxDepth and says so", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "depth", maxDepth: 1 });
    expect(find(rows, "config")?.children).toMatchObject({ kind: "link", reason: "depth" });
  });

  it("marks an unresolved ref rather than dropping it", () => {
    const dangling: Node = { ...ref("demo#/nope") };
    const rows = toRows(dangling, ir);
    expect(rows[0]?.children).toEqual({
      kind: "link",
      target: "demo#/nope",
      reason: "unresolved",
    });
  });
});

describe("toTree — recursion", () => {
  it("terminates on a self-referential type", () => {
    const rows = toRows(treeRef, ir, { expandRefs: "always" });
    expect(find(rows, "children")?.children).toEqual({
      kind: "cycle",
      target: ids("TreeNode"),
    });
  });

  it("does not let sibling branches poison each other's ancestor set", () => {
    // Job references TranscriptionConfig twice over (directly, and via Message
    // in other trees). Expanding one branch must not mark the other a cycle.
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    const cycles = rows.filter((r) => r.children.kind === "cycle");
    expect(cycles.map((c) => c.path.join("/"))).toEqual(["tree/children"]);
  });
});

describe("toTree — arrays are transparent", () => {
  it("renders an array of refs as a list, not a wrapper level", () => {
    const rows = toRows(treeRef, ir, { expandRefs: "always" });
    const children = find(rows, "children");
    expect(children?.typeLabel).toBe("TreeNode[]");
    expect(children?.typeRef).toBe(ids("TreeNode"));
  });
});

describe("toTree — docs precedence", () => {
  it("prefers the property's own description over the ref target's", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "config/language")?.docs.description).toBe("Language of the audio you are submitting.");
  });

  it("falls back to the type's description when the property has none", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "tree")?.docs.description).toBe("A node in a tree.");
  });

  it("inherits the target's default when the usage does not override it", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "config/language")?.docs.default).toBe("en");
  });
});

describe("toTree — view projection", () => {
  it("drops readOnly properties from a request view", () => {
    const rows = toRows(jobRef, ir, { view: "request", expandRefs: "always" });
    expect(find(rows, "id")).toBeUndefined();
    expect(find(rows, "config")).toBeDefined();
  });

  it("drops writeOnly properties from a response view, through a ref", () => {
    const rows = toRows(jobRef, ir, { view: "response", expandRefs: "always" });
    expect(find(rows, "config/internal_flag")).toBeUndefined();
    expect(find(rows, "id")).toBeDefined();
  });

  it("standalone projectForView agrees with the tree, for ref-free structure", () => {
    const projected = projectForView(ir.schemas[ids("TranscriptionConfig")]!.node, "response");
    expect(projected.kind).toBe("object");
    if (projected.kind !== "object") throw new Error("unreachable");
    expect(projected.properties.map((p) => p.name)).not.toContain("internal_flag");
  });
});

describe("toTree — unions", () => {
  it("exposes variants with their discriminator value as a chip", () => {
    const tree = toTree(messageRef, ir, { expandRefs: "always" });
    expect(tree.children.kind).toBe("variants");
    if (tree.children.kind !== "variants") throw new Error("unreachable");
    expect(tree.children.label).toBe("one of");
    expect(tree.children.nodes.map((n) => n.name)).toEqual(["StartRecognition", "AddAudio"]);
    expect(tree.children.nodes[0]?.chips[0]).toEqual({
      kind: "note",
      label: 'message: "StartRecognition"',
      value: "StartRecognition",
    });
  });
});

describe("toRows", () => {
  it("produces unique keys for every row", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("gives each row an address of property names, with an array's [] on its name", () => {
    const tree = obj([prop("results", arr(obj([prop("alternatives", arr(obj([prop("content", str())])))])))]);
    const rows = toRows(tree, ir);
    expect(find(rows, "results/[]/alternatives/[]/content")?.address).toEqual([
      "results[]",
      "alternatives[]",
      "content",
    ]);
  });

  it("leaves a union's branches out of the address, though the path has them", () => {
    const rows = toRows(messageRef, ir, { expandRefs: "always" });
    const branch = rows.find((r) => r.name === "StartRecognition");
    expect(branch?.address).toEqual([]);
    const child = rows.find((r) => r.path[0] === "StartRecognition" && r.path.length === 2);
    expect(child?.address).toEqual([child?.name]);
  });

  it("carries depth for indentation", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "config")?.depth).toBe(1);
    expect(find(rows, "config/language")?.depth).toBe(2);
  });
});

describe("collectLinks", () => {
  it("reports every type a static renderer must emit a section for", () => {
    expect(collectLinks(toTree(jobRef, ir)).sort()).toEqual([ids("TranscriptionConfig"), ids("TreeNode")].sort());
  });
});

describe("typeLabel", () => {
  const ctx = { schemas: ir.schemas };
  const label = (n: Parameters<typeof typeLabel>[0]) => typeLabel(n, ctx);

  it("names registry types", () => {
    expect(label(jobRef)).toBe("Job");
  });

  it("puts format in the label", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "id")?.typeLabel).toBe("string<uuid>");
    expect(find(rows, "retry_count")?.typeLabel).toBe("integer");
  });

  it("renders maps as Record<K, V> and arrays as X[]", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "metadata")?.typeLabel).toBe("Record<string, string>");
    expect(find(rows, "tree/children")?.typeLabel).toBe("TreeNode[]");
  });

  it("inlines small enums and collapses large ones", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "config/operating_point")?.typeLabel).toBe('"standard" | "enhanced"');
  });
});

describe("chips", () => {
  it("resolves a ref'd type's constraints onto the field that uses it", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    const language = find(rows, "config/language");
    // pattern and default live on the Language type, not on the property.
    expect(language?.chips).toEqual([
      { kind: "default", label: 'default: "en"', value: "en" },
      { kind: "pattern", label: "matches /^[a-z]{2}$/", value: "^[a-z]{2}$" },
    ]);
  });

  it("spells out a small enum behind a $ref, which its name-only label does not", () => {
    const direction = ids("Direction");
    const withEnum = {
      ...ir,
      schemas: {
        ...ir.schemas,
        [direction]: {
          ...ir.schemas[ids("Language")]!,
          id: direction,
          name: "Direction",
          node: enumNode(["ltr", "rtl"]),
        },
      },
    };
    const rows = toRows(obj([prop("dir", ref(direction))]), withEnum, { expandRefs: "always" });
    expect(find(rows, "dir")?.typeLabel).toBe("Direction");
    expect(find(rows, "dir")?.chips.map((c) => c.label)).toEqual(['"ltr"', '"rtl"']);
  });

  it("gives an enum with documented values a row per value, instead of chips", () => {
    const documented = {
      ...enumNode(["ok", "busy"]),
      members: [
        { value: "ok", docs: { description: "All is well." } },
        { value: "busy", docs: { description: "Try later." } },
      ],
    };
    const field = find(toRows(obj([prop("status", documented)]), ir), "status");
    expect(field?.chips).toEqual([]);
    expect(field?.children.kind).toBe("variants");
    const rows = field?.children.kind === "variants" ? field.children.nodes : [];
    expect(rows.map((r) => [r.typeLabel, r.docs.description])).toEqual([
      ['"ok"', "All is well."],
      ['"busy"', "Try later."],
    ]);
  });

  it("renders constraints, defaults and property flags", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    expect(find(rows, "retry_count")?.chips).toEqual([{ kind: "range", label: "≥ 0" }]);
    expect(find(rows, "config/diarization")?.chips).toEqual([
      { kind: "default", label: "default: false", value: false },
    ]);
    expect(find(rows, "config/internal_flag")?.chips.map((c) => c.kind)).toEqual(["deprecated", "writeOnly"]);
  });

  it("does not duplicate required, nullable or format as chips", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    const kinds = rows.flatMap((r) => r.chips.map((c) => c.kind));
    expect(kinds).not.toContain("required");
  });
});

describe("unsupported nodes", () => {
  it("survives to the renderer as a labelled leaf", () => {
    const rows = toRows(jobRef, ir, { expandRefs: "always" });
    const node = find(rows, "conditions");
    expect(node?.typeLabel).toBe("unknown");
    expect(node?.children).toEqual({ kind: "none" });
  });
});
