/**
 * The hooks, used the way a consumer who wants none of the shipped components
 * would use them: build the markup yourself from `FieldNode`s.
 */

import type { ApiIR, FieldNode } from "@speculoos/core";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  SpeculoosProvider,
  useFieldRows,
  useFieldTree,
  useOperation,
  useOperations,
  useTagGroups,
  useTypeDef,
  useTypeLabel,
} from "../src/index.js";
import { boxy } from "./fake.js";

let ir: ApiIR;
const jobId = "batch#/components/schemas/Job";

beforeAll(async () => {
  const project = await load({ root: specDir, documents: [{ name: "batch", path: "batch.yaml" }] });
  ir = buildOpenApi({ project });
});

/** Renders a hook's result by handing it to a probe component. */
function probe(use: () => unknown): string {
  const Probe = (): ReactNode => <x-out>{JSON.stringify(use())}</x-out>;
  return renderToStaticMarkup(
    <SpeculoosProvider ir={ir} components={boxy}>
      <Probe />
    </SpeculoosProvider>,
  );
}

describe("useFieldTree / useFieldRows", () => {
  it("resolves children so the consumer never implements a depth budget", () => {
    let tree!: FieldNode;
    const Probe = (): ReactNode => {
      tree = useFieldTree(ir.schemas[jobId]!.node, { expandRefs: "always" });
      return null;
    };
    renderToStaticMarkup(
      <SpeculoosProvider ir={ir} components={boxy}>
        <Probe />
      </SpeculoosProvider>,
    );
    // Job.parent -> Job. Starting from Job's own node, Job is not yet an
    // ancestor, so the first `parent` expands and the second terminates. The
    // point is that something terminates it without this component knowing how.
    const child = (f: FieldNode | undefined, name: string): FieldNode | undefined =>
      f?.children.kind === "inline" ? f.children.nodes.find((n) => n.name === name) : undefined;
    const parent = child(tree, "parent");
    expect(parent?.children.kind).toBe("inline");
    expect(child(parent, "parent")?.children).toEqual({ kind: "cycle", target: jobId });
  });

  it("flattens to the same nodes in pre-order", () => {
    let rows!: FieldNode[];
    let tree!: FieldNode;
    const Probe = (): ReactNode => {
      tree = useFieldTree(ir.schemas[jobId]!.node);
      rows = useFieldRows(ir.schemas[jobId]!.node);
      return null;
    };
    renderToStaticMarkup(
      <SpeculoosProvider ir={ir} components={boxy}>
        <Probe />
      </SpeculoosProvider>,
    );
    expect(rows[0]?.key).toBe(tree.key);
    expect(rows.map((r) => r.name)).toContain("config");
  });

  it("projects a view", () => {
    const names = (view: "request" | "response"): (string | undefined)[] => {
      let rows: FieldNode[] = [];
      const Probe = (): ReactNode => {
        rows = useFieldRows(ir.schemas[jobId]!.node, { view });
        return null;
      };
      renderToStaticMarkup(
        <SpeculoosProvider ir={ir} components={boxy}>
          <Probe />
        </SpeculoosProvider>,
      );
      return rows.map((r) => r.name);
    };
    expect(names("request")).toContain("secret");
    expect(names("request")).not.toContain("id");
    expect(names("response")).toContain("id");
    expect(names("response")).not.toContain("secret");
  });
});

describe("lookup hooks", () => {
  it("finds an operation with the endpoint it hangs off", () => {
    expect(probe(() => useOperation("listJobs")?.endpoint.address)).toContain("/jobs");
  });

  it("returns undefined for an operation that is not there", () => {
    expect(probe(() => useOperation("nope") ?? null)).toBe("<x-out>null</x-out>");
  });

  it("lists every operation in document order", () => {
    expect(probe(() => useOperations().map((e) => e.operation.id))).toContain("createJob");
  });

  it("groups by tag", () => {
    expect(probe(() => useTagGroups().map((g) => g.tag.name))).toContain("Jobs");
  });

  it("labels a type and resolves a registry entry", () => {
    expect(probe(() => useTypeLabel(ir.schemas[jobId]!.node))).toContain("object");
    expect(probe(() => useTypeDef(jobId)?.name)).toContain("Job");
    expect(probe(() => useTypeDef(undefined) ?? null)).toBe("<x-out>null</x-out>");
  });
});
