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
 */

import type { ReactNode } from "react";
import { Badge, Box, DataList, Flex, Text } from "@radix-ui/themes";
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

/** The marks that sit with a field's name: required, deprecated. */
function Marks({ required, deprecated, colors }: { required: boolean; deprecated: boolean; colors: BadgeColors }): ReactNode {
  if (!required && !deprecated) return null;
  return (
    <>
      {required && <Badge color={colors.tone.required} size="1">required</Badge>}
      {deprecated && <Badge color={colors.tone.deprecated} size="1">deprecated</Badge>}
    </>
  );
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
      <DataList.Root size={size} my="3" data-kind={kind}>
        {children}
      </DataList.Root>
    );
  }
  return Fields;
}

export function fieldRow(colors: BadgeColors) {
  function FieldRow(props: FieldRowProps): ReactNode {
    const { field, depth, name, docs, required, deprecated, children } = props;
    return (
      <>
        <DataList.Item data-key={field.key} align="start">
          <DataList.Label minWidth="180px">
            <Box pl={indent(depth)}>
              <Flex direction="column" gap="1" align="start">
                <Name name={name} />
                <Marks required={required} deprecated={deprecated} colors={colors} />
              </Flex>
            </Box>
          </DataList.Label>
          <DataList.Value>
            <Flex direction="column" gap="1">
              <TypeLine {...props} />
              {docs}
            </Flex>
          </DataList.Value>
        </DataList.Item>
        {children}
      </>
    );
  }
  return FieldRow;
}
