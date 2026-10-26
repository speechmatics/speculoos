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
 *   ./operation.tsx   `Endpoint` — a path or channel; `Operation` — either operation shape
 *   ./navigation.tsx  `EndpointList`, `OperationList`, `TypeSection`, `TypeSections`
 */

export {
  SpeculoosProvider,
  useSpeculoos,
  useComponents,
  useHref,
  defaultHref,
  type SpeculoosOptions,
  type SpeculoosProviderProps,
  type SpeculoosContextValue,
} from "./context.js";

export {
  useFieldTree,
  useFieldRows,
  useEndpoint,
  useEndpoints,
  useOperation,
  useOperations,
  useTagGroups,
  useTypeLabel,
  useTypeDef,
  type FieldOptions,
} from "./hooks.js";

export { SchemaTable, FieldRows, DocsBody, type SchemaTableProps, type FieldRowsProps } from "./fields.js";
export { Endpoint, Operation, type EndpointProps, type OperationProps } from "./operation.js";
export {
  EndpointList,
  OperationList,
  TypeSection,
  TypeSections,
  type EndpointListProps,
  type OperationListProps,
  type TypeSectionProps,
  type TypeSectionsProps,
} from "./navigation.js";
export { propertiesNode, parametersNode, parameterProperty } from "./synth.js";
export { DIRECTION_LABEL, DIRECTION_VERB } from "./labels.js";

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
