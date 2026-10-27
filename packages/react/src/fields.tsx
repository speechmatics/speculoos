/**
 * Turning `FieldNode`s into rows.
 *
 * All the recursion is here and all of it is trivial, because `children` is
 * already resolved: "link", "cycle" and "depth" are decisions `@speculoos/core`
 * has already taken. A renderer that had to decide them would be reimplementing
 * cycle detection, and getting that wrong once means a self-referential schema
 * hangs the build.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import { toFieldList } from "@speculoos/core";
import type { Chip, Docs, FieldNode, Node, Parameter, TypeId, View } from "@speculoos/core";
import { useComponents, useSpeculoos } from "./context.js";
import { useFieldTree } from "./hooks.js";
import type { Components, FieldRowProps } from "./components.js";

/** Description, external link and the title when it adds something. */
export function DocsBody({ docs }: { docs: Docs }): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  const external = docs.externalDocs;
  if (docs.description === undefined && external === undefined) return null;
  return (
    <>
      {docs.description !== undefined && <C.Markdown>{docs.description}</C.Markdown>}
      {external !== undefined && (
        <C.Link href={options.href({ kind: "external", url: external.url }) ?? external.url}
          target={{ kind: "external", url: external.url }}>
          {external.description ?? external.url}
        </C.Link>
      )}
    </>
  );
}

function ChipBadges({ chips }: { chips: Chip[] }): ReactNode {
  const C = useComponents();
  return (
    <>
      {chips.map((chip, i) => (
        <C.Badge key={`${chip.kind}-${i}`} tone={chip.kind === "note" ? "note" : "constraint"} chip={chip}>
          {chip.label}
        </C.Badge>
      ))}
    </>
  );
}

/** The "Type" cell: a link when the type has a section of its own, else a literal. */
function TypeCell({ field }: { field: FieldNode }): ReactNode {
  const C = useComponents();
  const { ir, options } = useSpeculoos();
  const target = field.typeRef;
  const def = target === undefined ? undefined : ir.schemas[target];
  const href = target === undefined ? undefined : options.href({ kind: "type", id: target, def });
  const label = <C.Code>{field.typeLabel}</C.Code>;
  if (target === undefined || href === undefined) return label;
  return (
    <C.Link href={href} target={{ kind: "type", id: target, def }}>
      {label}
    </C.Link>
  );
}

/** `allOf` ancestors, as links rather than the plain `extends X` chips. */
function Composition({ ids }: { ids: TypeId[] }): ReactNode {
  const C = useComponents();
  const { ir, options } = useSpeculoos();
  return (
    <>
      {ids.map((id) => {
        const def = ir.schemas[id];
        const href = options.href({ kind: "type", id, def });
        const body = <>extends <C.Code>{def?.name ?? id}</C.Code></>;
        return (
          <Fragment key={id}>
            {href === undefined ? (
              <C.Badge tone="constraint">{body}</C.Badge>
            ) : (
              <C.Link href={href} target={{ kind: "type", id, def }}>
                {body}
              </C.Link>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Chips that come from the shape of the field rather than from a constraint:
 * nullability, recursion and an unresolved reference. The IR keeps these off
 * `chips` on purpose — `nullable` is a first-class field, and `children` is a
 * resolution outcome — so it falls to the renderer to make them visible.
 *
 * Nullability usually is visible already: the type label ends `| null` unless
 * `nullableSuffix` is off. The chip is for when it is.
 */
function shapeChips(field: FieldNode): Chip[] {
  const out: Chip[] = [];
  if (field.nullable && !field.typeLabel.endsWith(" | null")) out.push({ kind: "note", label: "nullable" });
  if (field.children.kind === "cycle") out.push({ kind: "note", label: "recursive" });
  if (field.children.kind === "link" && field.children.reason === "unresolved") {
    out.push({ kind: "note", label: "unresolved reference", value: field.children.target });
  }
  return out;
}

export interface FieldRowsProps {
  fields: FieldNode[];
  /** Set on the top-level rows of a parameter table. */
  location?: Parameter["in"];
  /** "tree" nests; "rows" has already been flattened and must not recurse. */
  nested: boolean;
}

function rowProps(field: FieldNode, C: Components, location?: Parameter["in"]): Omit<FieldRowProps, "children"> {
  const composed = field.composedFrom ?? [];
  const chips = [
    ...field.chips.filter((c) => c.kind !== "extends"),
    ...shapeChips(field),
  ];
  return {
    field,
    depth: field.depth,
    name: field.name === undefined ? null : <C.Code>{field.name}</C.Code>,
    type: <TypeCell field={field} />,
    chips: (
      <>
        <ChipBadges chips={chips} />
        {composed.length > 0 && <Composition ids={composed} />}
      </>
    ),
    docs: <DocsBody docs={field.docs} />,
    required: field.required,
    deprecated: field.docs.deprecated === true,
    ...(field.children.kind === "variants" ? { variantsLabel: field.children.label } : {}),
    ...(location !== undefined ? { location } : {}),
  };
}

/** Renders a list of fields as rows, recursing when the layout is "tree". */
export function FieldRows({ fields, location, nested }: FieldRowsProps): ReactNode {
  const C = useComponents();
  return (
    <>
      {fields.map((field) => {
        const kids =
          nested && (field.children.kind === "inline" || field.children.kind === "variants")
            ? field.children.nodes
            : [];
        return (
          <C.FieldRow key={field.key} {...rowProps(field, C, field.depth === 0 ? location : undefined)}>
            {kids.length > 0 ? <FieldRows fields={kids} nested={nested} /> : undefined}
          </C.FieldRow>
        );
      })}
    </>
  );
}

export interface SchemaTableProps {
  /** The node to render. Give this or `typeId`. */
  node?: Node;
  /** A registry entry to render instead. */
  typeId?: TypeId;
  /**
   * Which projection this content is. Always pass `variant.view` for request or
   * response content: the adapter could not project through a `$ref`, so the
   * view travels with the content and has to be handed on here.
   */
  view?: View;
  expandRefs?: "never" | "depth" | "always";
  maxDepth?: number;
  kind?: "fields" | "parameters" | "headers";
  /** Shown when the node has no rows at all. */
  empty?: ReactNode;
}

/**
 * A field table for one node.
 *
 * The root row is dropped when it is an unnamed object — a table headed by a
 * nameless row of type `object` tells a reader nothing — but kept whenever it
 * carries the only information there is, such as a scalar body or a link to a
 * named type.
 */
export function SchemaTable(props: SchemaTableProps): ReactNode {
  const { node, typeId, view, expandRefs, maxDepth, kind = "fields", empty } = props;
  const C = useComponents();
  const { ir, options } = useSpeculoos();
  const resolved = node ?? (typeId === undefined ? undefined : ir.schemas[typeId]?.node);
  if (resolved === undefined) {
    return empty === undefined ? null : <C.Empty>{empty}</C.Empty>;
  }
  return (
    <SchemaTableBody
      node={resolved}
      kind={kind}
      nested={options.layout === "tree"}
      {...(view !== undefined ? { view } : {})}
      {...(expandRefs !== undefined ? { expandRefs } : {})}
      {...(maxDepth !== undefined ? { maxDepth } : {})}
      {...(empty !== undefined ? { empty } : {})}
    />
  );
}

interface BodyProps {
  node: Node;
  kind: "fields" | "parameters" | "headers";
  nested: boolean;
  view?: View;
  expandRefs?: "never" | "depth" | "always";
  maxDepth?: number;
  empty?: ReactNode;
}

function SchemaTableBody({ node, kind, nested, view, expandRefs, maxDepth, empty }: BodyProps): ReactNode {
  const C = useComponents();
  const opts = {
    ...(view !== undefined ? { view } : {}),
    ...(expandRefs !== undefined ? { expandRefs } : {}),
    ...(maxDepth !== undefined ? { maxDepth } : {}),
  };
  const tree = useFieldTree(node, opts);
  // Which rows to show, and what a dropped root row was carrying, are decisions
  // about content rather than markup, so `@speculoos/core` takes them and both
  // renderers get the same answer.
  const { fields, composedFrom } = useMemo(
    () => toFieldList(tree, nested ? "tree" : "rows"),
    [tree, nested],
  );

  if (fields.length === 0 && composedFrom.length === 0) {
    return empty === undefined ? null : <C.Empty>{empty}</C.Empty>;
  }
  return (
    <>
      {composedFrom.length > 0 && <Composition ids={composedFrom} />}
      {fields.length > 0 && (
        <C.Fields kind={kind}>
          <FieldRows fields={fields} nested={nested} />
        </C.Fields>
      )}
    </>
  );
}
