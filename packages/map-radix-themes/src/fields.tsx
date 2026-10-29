/**
 * Field rows, as a Radix `DataList`: by default stacked, the name, type,
 * constraints and "required" on one line and the description under it; see
 * `FieldLayout` for the two-column alternative.
 *
 * A `DataList` was chosen over a `Table` by looking at both: it reads better for
 * schemas, parameters and headers alike, and a `Table`'s column headers bought
 * nothing a reader needed.
 *
 * Nested rows are returned *after* their parent, in a box of their own: a
 * border and a faint fill, one box inside another per level. A `<dl>` could
 * nest, but a row cannot tell which layout it is in — `children` is absent on
 * a leaf in "tree" and on every row in "rows" — so the rows inside a box are
 * still siblings of each other, on the list's own flow or grid. An indent
 * alone was tried first, and three levels down it no longer said whose
 * property a row was.
 *
 * Nested rows start collapsed behind a "Show 4 properties" toggle, so a site
 * can expand named types inline (`expandRefs: "always"`) without a page of
 * every field of every type — or open, when the table asks (`expanded`). In "rows" layout there are no `children` to hide,
 * and nothing toggles.
 */

import { Badge, Box, Button, DataList, Flex, Text } from "@radix-ui/themes";
import type { FieldRowProps, FieldsProps } from "@speculoos/react";
import { type ReactNode, useId, useState } from "react";
import type { BadgeColors } from "./colors.js";

export type Size = "1" | "2" | "3";

/**
 * How a field row is laid out.
 *
 *   "columns"   name on the left, type and description on the right; stacked
 *               below the `sm` breakpoint, where two columns do not fit.
 *   "vertical"  always stacked: the name's line, then type, then description.
 *   "stacked"   Deepgram's: name, type, constraints and "required" on one
 *               line, the description under it, a rule between fields. The
 *               default: each field reads as one unit, and the description
 *               gets the full width rather than losing a column to the name.
 */
export type FieldLayout = "columns" | "vertical" | "stacked";

/**
 * Which of a field's two states is marked. "optional" (the default) marks the
 * exception in an API where most fields are required, and leaves the rest of
 * the rows quiet; "required" is the other way round.
 */
export type Presence = "optional" | "required";

/**
 * The field name, in bold. `name` arrives already built from the map's own
 * `Code`, which is a ghost and so takes this weight and colour.
 *
 * A row with no name — an enum's value, a union's branch, a scalar payload —
 * is identified by its type instead, so the type takes the name's place:
 * `"invalid_model"` heads its own description, and a dash would say nothing.
 */
function Name({ name, type }: Pick<FieldRowProps, "name" | "type">): ReactNode {
  return (
    <Text weight="bold" style={{ color: "var(--gray-12)" }}>
      {named(name) ? name : type}
    </Text>
  );
}

function named(name: FieldRowProps["name"]): boolean {
  return name !== null && name !== undefined;
}

/**
 * The marks that sit on the name's line: optional or required (see
 * `Presence`), deprecated. Text rather than badges — one of them is on most
 * rows, and a badge on most rows is noise. A row with no name — an enum's
 * value, a union's branch — is neither.
 */
function Marks({
  named: hasName,
  required,
  deprecated,
  colors,
  presence,
}: {
  named: boolean;
  required: boolean;
  deprecated: boolean;
  colors: BadgeColors;
  presence: Presence;
}): ReactNode {
  const mark = !hasName
    ? null
    : presence === "optional"
      ? !required && (
          <Text size="1" color="gray">
            optional
          </Text>
        )
      : required && (
          <Text size="1" color={colors.tone.required}>
            required
          </Text>
        );
  return (
    <>
      {mark}
      {deprecated && (
        <Badge color={colors.tone.deprecated} size="1">
          deprecated
        </Badge>
      )}
    </>
  );
}

/** "Show 4 properties", or "Show 2 options" for a union's branches. */
function toggleLabel(field: FieldRowProps["field"], open: boolean): string {
  const nodes = field.children.kind === "inline" || field.children.kind === "variants" ? field.children.nodes : [];
  const noun = field.children.kind === "variants" ? "option" : "property";
  const plural = nodes.length === 1 ? noun : noun === "property" ? "properties" : "options";
  return `${open ? "Hide" : "Show"} ${nodes.length} ${plural}`;
}

/**
 * Type, then "one of", then constraint chips — what the value may be. The type
 * is left out when it already stands in for the name.
 */
function TypeLine({
  name,
  type,
  variantsLabel,
  chips,
}: Pick<FieldRowProps, "name" | "type" | "variantsLabel" | "chips">): ReactNode {
  return (
    <Flex gap="2" wrap="wrap" align="center">
      {named(name) && <Text style={{ color: "var(--gray-12)" }}>{type}</Text>}
      {variantsLabel !== undefined && (
        <Text size="1" color="gray">
          {variantsLabel}
        </Text>
      )}
      {chips}
    </Flex>
  );
}

/**
 * The box a row's nested rows open into.
 *
 * It must not break the list it sits in. Stacked or vertical, a `DataList` is
 * a flex column, so the box is one too and takes the list's gap (`inherit`, so
 * a box in a box still has it). In "columns" it is a grid with two tracks the
 * labels line up on, so the box spans both and takes them as a `subgrid` — and
 * below `sm`, where the list turns into a flex column, a subgrid with no grid
 * above it is just a grid of one column, which is what stacked rows want.
 *
 * Its padding is the indent, so a deeper level is further in because it is
 * inside more boxes, and it is smaller on a phone, where three levels of it
 * would leave a description a few words wide.
 *
 * Stacked rows open with a rule, which in the first row would draw a second
 * line just under the box's border. The rows sit 1px higher than the box's
 * padding, and the box clips what is above its padding, so the first rule is
 * hidden and the others are not.
 */
function NestedBox({
  id,
  open,
  layout,
  children,
}: {
  id: string;
  open: boolean;
  layout: FieldLayout;
  children: ReactNode;
}): ReactNode {
  const flow =
    layout === "columns"
      ? { display: "grid", gridTemplateColumns: "subgrid", gridColumn: "1 / -1", gap: "inherit" }
      : { display: "flex", flexDirection: "column" as const, gap: "inherit" };
  const ruled = layout === "stacked";
  return (
    <Box
      id={id}
      px={{ initial: "2", sm: "3" }}
      pt={ruled ? "0" : "3"}
      pb="3"
      style={{
        ...(open ? flow : { display: "none" }),
        border: "1px solid var(--gray-a5)",
        borderRadius: "var(--radius-3)",
        background: "var(--gray-a2)",
        overflow: ruled ? "hidden" : undefined,
      }}
    >
      {ruled ? <div style={{ ...flow, marginTop: -1 }}>{children}</div> : children}
    </Box>
  );
}

export function fields(size: Size, layout: FieldLayout) {
  function Fields({ kind, children }: FieldsProps): ReactNode {
    return (
      // In "columns", side by side from the `sm` breakpoint; stacked, name over
      // value, below it, where two columns leave a value a few characters wide.
      <DataList.Root
        size={size}
        my="2"
        orientation={layout === "columns" ? { initial: "vertical", sm: "horizontal" } : "vertical"}
        data-kind={kind}
      >
        {children}
      </DataList.Root>
    );
  }
  return Fields;
}

export function fieldRow(colors: BadgeColors, layout: FieldLayout, presence: Presence) {
  function FieldRow(props: FieldRowProps): ReactNode {
    const { field, name, docs, required, deprecated, expanded, children } = props;
    const [open, setOpen] = useState(expanded === true);
    const nested = useId();
    const hasChildren = children !== undefined && children !== null;
    const described = field.docs.description !== undefined || field.docs.externalDocs !== undefined;
    const columns = layout === "columns";
    const oneLine = layout === "stacked";
    const rowStyle = oneLine ? { borderTop: "1px solid var(--gray-a4)", paddingTop: "var(--space-3)" } : {};
    return (
      <>
        <DataList.Item data-key={field.key} align="start" style={rowStyle}>
          <DataList.Label minWidth={columns ? { initial: "0", sm: "180px" } : "0"}>
            <Flex gap="2" align="baseline" wrap="wrap">
              <Name name={name} type={props.type} />
              {oneLine && <TypeLine {...props} />}
              <Marks
                named={named(name)}
                required={required}
                deprecated={deprecated}
                colors={colors}
                presence={presence}
              />
            </Flex>
          </DataList.Label>
          {/* Grid and flex items will not shrink below their content by
              default, so one wide thing in a description — a table, a long
              literal — would widen the whole list past its card. Every level
              opts out, and the description takes the full width, so a wide
              table scrolls inside its own scroll area instead. */}
          {/* Stacked, an empty value would still take a line under the name. */}
          {(!oneLine || described || hasChildren) && (
            <DataList.Value style={{ minWidth: 0 }}>
              <Flex direction="column" gap="1" align="start" minWidth="0" width="100%">
                {!oneLine && <TypeLine {...props} />}
                {/* Lighter than the name and type above it: the row is read by
                    those, and the description is there for whoever stops. A
                    plain colour, not Text's `color`, which would grey its links
                    too. */}
                {described && (
                  <Text as="div" size="2" style={{ width: "100%", color: "var(--gray-11)" }}>
                    {docs}
                  </Text>
                )}
                {hasChildren && (
                  <Button
                    variant="ghost"
                    size="1"
                    color="gray"
                    aria-expanded={open}
                    aria-controls={nested}
                    onClick={() => setOpen((o) => !o)}
                  >
                    <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                    {toggleLabel(field, open)}
                  </Button>
                )}
              </Flex>
            </DataList.Value>
          )}
        </DataList.Item>
        {hasChildren && (
          <NestedBox id={nested} open={open} layout={layout}>
            {children}
          </NestedBox>
        )}
      </>
    );
  }
  return FieldRow;
}
