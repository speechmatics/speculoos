/**
 * @speculoos/react — a headless React binding for the Speculoos IR.
 *
 * **This package ships no styles, no CSS and no DOM.** Every element on the
 * page comes from the component map you supply; Speculoos decides only what is
 * handed to it and in what order. In particular, descriptions arrive as raw
 * CommonMark from a document you did not write: rendering and **sanitising**
 * them is your `Markdown` component's job and nothing here will do it for you.
 *
 *   ./components.ts   the component map — the whole contract with a design system
 *   ./context.tsx     `SpeculoosProvider` and the site-level options
 *   ./hooks.ts        `useFieldTree`, `useFieldRows`, `useOperation`, …
 *   ./fields.tsx      `SchemaTable` — a node as rows
 *   ./operation.tsx   `Entry` — one reference entry; `Endpoint` — a path or channel; `Operation`
 *   ./navigation.tsx  `EntryList`, `OperationList`, `TypeSection`, `TypeSections`
 */

export type { ApiEntry, EntryExample } from "@speculoos/core";
export type {
  BadgeProps,
  BadgeTone,
  CodeBlockProps,
  CodeProps,
  Components,
  EmptyProps,
  FieldRowProps,
  FieldsProps,
  HrefTarget,
  LinkProps,
  ListItemProps,
  ListProps,
  MarkdownProps,
  SectionKind,
  SectionProps,
  Tab,
  TabsProps,
} from "./components.js";
export {
  defaultHref,
  type SpeculoosContextValue,
  type SpeculoosOptions,
  SpeculoosProvider,
  type SpeculoosProviderProps,
  useComponents,
  useHref,
  useSpeculoos,
} from "./context.js";
export { DocsBody, FieldRows, type FieldRowsProps, SchemaTable, type SchemaTableProps } from "./fields.js";
export {
  type FieldOptions,
  useEndpoint,
  useEndpoints,
  useEntries,
  useFieldRows,
  useFieldTree,
  useOperation,
  useOperations,
  useTagGroups,
  useTypeDef,
  useTypeLabel,
} from "./hooks.js";
export { DIRECTION_LABEL, DIRECTION_VERB } from "./labels.js";
export {
  EntryList,
  OperationList,
  type OperationListProps,
  TypeSection,
  type TypeSectionProps,
  TypeSections,
  type TypeSectionsProps,
} from "./navigation.js";
export {
  Endpoint,
  type EndpointProps,
  Entry,
  EntryExamples,
  type EntryExamplesProps,
  type EntryProps,
  Operation,
  type OperationProps,
} from "./operation.js";
export { parameterProperty, parametersNode, propertiesNode } from "./synth.js";
