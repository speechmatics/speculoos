/**
 * Hooks, for consumers who want their own markup entirely.
 *
 * Everything the shipped components do goes through these, so "drive it
 * yourself" is not a lesser path — `<SchemaTable>` is forty lines over
 * `useFieldRows` and you can write your own.
 */

import { useMemo } from "react";
import {
  allOperations,
  groupByTag,
  toRows,
  toTree,
  typeLabel,
  type FieldNode,
  type LabelOptions,
  type Node,
  type OperationEntry,
  type TagGroup,
  type TypeDef,
  type TypeId,
  type View,
  type ViewOptions,
} from "@speculoos/core";
import { useSpeculoos } from "./context.js";

/** Per-call overrides. `view` has no provider-level default: it is per content. */
export interface FieldOptions {
  view?: View;
  expandRefs?: "never" | "depth" | "always";
  maxDepth?: number;
  label?: LabelOptions;
}

function useViewOptions(opts: FieldOptions | undefined): ViewOptions {
  const { options } = useSpeculoos();
  const { view, expandRefs, maxDepth, label } = opts ?? {};
  return useMemo(
    () => ({
      view: view ?? "neutral",
      expandRefs: expandRefs ?? options.expandRefs,
      maxDepth: maxDepth ?? options.maxDepth,
      ...(label ? { label } : {}),
    }),
    [view, expandRefs, maxDepth, label, options.expandRefs, options.maxDepth],
  );
}

/** The nested display tree for a node, with `children` already resolved. */
export function useFieldTree(node: Node, opts?: FieldOptions): FieldNode {
  const { ir } = useSpeculoos();
  const viewOptions = useViewOptions(opts);
  return useMemo(() => toTree(node, ir, viewOptions), [node, ir, viewOptions]);
}

/** The same nodes, flattened pre-order. Each carries its own `depth`. */
export function useFieldRows(node: Node, opts?: FieldOptions): FieldNode[] {
  const { ir } = useSpeculoos();
  const viewOptions = useViewOptions(opts);
  return useMemo(() => toRows(node, ir, viewOptions), [node, ir, viewOptions]);
}

/** Looks an operation up by id, with the endpoint it hangs off. */
export function useOperation(id: string): OperationEntry | undefined {
  const { ir } = useSpeculoos();
  return useMemo(() => allOperations(ir).find((e) => e.operation.id === id), [ir, id]);
}

/** Every operation in document order. */
export function useOperations(): OperationEntry[] {
  const { ir } = useSpeculoos();
  return useMemo(() => allOperations(ir), [ir]);
}

/** Operations grouped under the document's declared tags, in declared order. */
export function useTagGroups(): TagGroup[] {
  const { ir, options } = useSpeculoos();
  return useMemo(() => groupByTag(ir, options.untaggedLabel), [ir, options.untaggedLabel]);
}

/** The string for the "Type" column. */
export function useTypeLabel(node: Node, opts?: LabelOptions): string {
  const { ir } = useSpeculoos();
  return useMemo(() => typeLabel(node, ir, opts ?? {}), [node, ir, opts]);
}

export function useTypeDef(id: TypeId | undefined): TypeDef | undefined {
  const { ir } = useSpeculoos();
  return id === undefined ? undefined : ir.schemas[id];
}
