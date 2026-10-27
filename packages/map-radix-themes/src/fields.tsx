/**
 * Field rows, as a Radix `DataList`: name on the left, type, constraints and
 * description on the right.
 *
 * A `DataList` was chosen over a `Table` by looking at both: it reads better for
 * schemas, parameters and headers alike, and a `Table`'s column headers bought
 * nothing a reader needed.
 *
 * Nested rows are returned *after* their parent, as siblings, indented by
 * depth. A `<dl>` could nest, but a row cannot tell which layout it is in —
 * `children` is absent on a leaf in "tree" and on every row in "rows" — so
 * nesting in one and indenting in the other would indent twice. Siblings
 * everywhere is the one shape that reads the same in both.
 *
 * Nested rows start collapsed behind a "Show 4 properties" toggle, so a site
 * can expand named types inline (`expandRefs: "always"`) without a page of
 * every field of every type. In "rows" layout there are no `children` to hide,
 * and nothing toggles.
 */

import { useId, useState, type ReactNode } from "react";
import { Badge, Box, Button, DataList, Flex, Text } from "@radix-ui/themes";
import type { FieldRowProps, FieldsProps } from "@speculoos/react";
import type { BadgeColors } from "./colors.js";

export type Size = "1" | "2" | "3";

type Space = "0" | "4" | "6" | "7" | "8";

/**
 * How far to indent a row, in Radix space steps.
 *
 * The top-level rows of a field list are at depth 1, because the nameless root
 * object above them is dropped; a root that is kept (a scalar body, a link to a
 * named type) is at depth 0 and has no siblings. Neither is indented.
 */
const INDENT: readonly Space[] = ["0", "4", "6", "7", "8"];

function indent(depth: number): Space {
  return INDENT[Math.min(Math.max(depth - 1, 0), INDENT.length - 1)] ?? "0";
}

/**
 * The field name, in bold. `name` arrives already built from the map's own
 * `Code`, which is a ghost and so takes this weight and colour. An array
 * element has no name; it gets a dash rather than an empty label.
 */
function Name({ name }: Pick<FieldRowProps, "name">): ReactNode {
  return name === null || name === undefined ? <Text color="gray">—</Text> : <Text weight="bold">{name}</Text>;
}

/**
 * The marks that sit on the name's line: required, deprecated. "required" is
 * coloured text, not a badge — it is on most rows, and a badge on most rows is
 * noise that also pushes each one onto a second line.
 */
function Marks({ required, deprecated, colors }: { required: boolean; deprecated: boolean; colors: BadgeColors }): ReactNode {
  if (!required && !deprecated) return null;
  return (
    <>
      {required && <Text size="1" color={colors.tone.required}>required</Text>}
      {deprecated && <Badge color={colors.tone.deprecated} size="1">deprecated</Badge>}
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

/** Type, then "one of", then constraint chips — what the value may be. */
function TypeLine({ type, variantsLabel, chips }: Pick<FieldRowProps, "type" | "variantsLabel" | "chips">): ReactNode {
  return (
    <Flex gap="2" wrap="wrap" align="center">
      {type}
      {variantsLabel !== undefined && <Text size="1" color="gray">{variantsLabel}</Text>}
      {chips}
    </Flex>
  );
}

export function fields(size: Size) {
  function Fields({ kind, children }: FieldsProps): ReactNode {
    return (
      <DataList.Root size={size} my="2" data-kind={kind}>
        {children}
      </DataList.Root>
    );
  }
  return Fields;
}

export function fieldRow(colors: BadgeColors) {
  function FieldRow(props: FieldRowProps): ReactNode {
    const { field, depth, name, docs, required, deprecated, children } = props;
    const [open, setOpen] = useState(false);
    const nested = useId();
    const hasChildren = children !== undefined && children !== null;
    return (
      <>
        <DataList.Item data-key={field.key} align="start">
          <DataList.Label minWidth="180px">
            <Box pl={indent(depth)}>
              <Flex gap="2" align="baseline" wrap="wrap">
                <Name name={name} />
                <Marks required={required} deprecated={deprecated} colors={colors} />
              </Flex>
            </Box>
          </DataList.Label>
          <DataList.Value>
            <Flex direction="column" gap="1" align="start">
              <TypeLine {...props} />
              {docs}
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
        </DataList.Item>
        {/* `display: contents` keeps the nested rows on the list's own grid. */}
        {hasChildren && (
          <div id={nested} style={{ display: open ? "contents" : "none" }}>
            {children}
          </div>
        )}
      </>
    );
  }
  return FieldRow;
}
