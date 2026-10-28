/**
 * Hooks, for consumers who want their own markup entirely.
 *
 * Everything the shipped components do goes through these, so "drive it
 * yourself" is not a lesser path — `<SchemaTable>` is forty lines over
 * `useFieldRows` and you can write your own.
 */

import {
  type ApiEntry,
  allOperations,
  apiEntries,
  type Endpoint,
  type FieldNode,
  groupByTag,
  type LabelOptions,
  listedEndpoints,
  type Node,
  type OperationEntry,
  type TagGroup,
  type TypeDef,
  type TypeId,
  toRows,
  toTree,
  typeLabel,
  type View,
  type ViewOptions,
} from "@speculoos/core";
import { useMemo } from "react";
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

/**
 * The API reference's entries, in document order: one per REST operation, one
 * per channel. One page each, if a site wants that — see `apiEntries` in core.
 */
export function useEntries(): ApiEntry[] {
  const { ir } = useSpeculoos();
  return useMemo(() => apiEntries(ir), [ir]);
}

/**
 * Every endpoint with at least one operation — path or channel — in document
 * order. One page each, if a site wants that. An endpoint with no operations
 * (a reply-only address) is left out; see `listedEndpoints` in core.
 */
export function useEndpoints(): Endpoint[] {
  const { ir } = useSpeculoos();
  return useMemo(() => listedEndpoints(ir), [ir]);
}

/** Looks an endpoint up by id: the path, the channel id, or "webhook:name". */
export function useEndpoint(id: string): Endpoint | undefined {
  const { ir } = useSpeculoos();
  return useMemo(() => ir.endpoints.find((e) => e.id === id), [ir, id]);
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
