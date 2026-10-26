/**
 * The component map.
 *
 * This is the whole of Speculoos's contract with a design system, and it is
 * deliberately a slot contract rather than a mirror of anyone's library: you
 * write a dozen small adapters once, and Speculoos never learns the name of a
 * single CSS class. Every entry is required. A default would be a style
 * decision made on your behalf, which is the thing this package exists to
 * avoid, and it would hide a slot you forgot to fill.
 *
 * Markdown arrives as raw CommonMark from an untrusted document. Rendering and
 * sanitising it is your `Markdown` component's job and nobody else's.
 */

import type { ComponentType, ReactNode } from "react";
import type { Chip, Docs, FieldNode, HrefTarget, Parameter } from "@speculoos/core";

/**
 * Where a link points. Defined in `@speculoos/core` rather than here: the HTML
 * renderer asks the same question at a `$ref`, and a site should be able to
 * write one `href` function and hand it to both. Re-exported for convenience.
 */
export type { HrefTarget };

/**
 * What a region of the page is. Passed to `Section` so one component can style
 * an operation differently from a response without Speculoos emitting markup.
 */
export type SectionKind =
  | "api"
  | "tag"
  | "endpoint"
  | "operation"
  | "parameters"
  | "request"
  | "response"
  | "messages"
  | "message"
  | "reply"
  | "callbacks"
  | "links"
  | "security"
  | "servers"
  | "type";

/** What a badge means. Styling hint only; the text is in `children`. */
export type BadgeTone =
  | "method"
  | "status"
  | "constraint"
  | "direction"
  | "required"
  | "deprecated"
  | "mediaType"
  | "protocol"
  | "securityScheme"
  | "note";

export interface SectionProps {
  kind: SectionKind;
  /** Anchor, taken from the IR's own slug. Renderers never derive anchors. */
  id?: string | undefined;
  title: ReactNode;
  /** Identifying marks that are not the title: a method badge, a path, a status. */
  subtitle?: ReactNode | undefined;
  /** Heading level, 1–6. Counts down from `options.headingLevel`. */
  level: number;
  deprecated?: boolean | undefined;
  children?: ReactNode | undefined;
}

/** Raw CommonMark. Sanitise it. */
export interface MarkdownProps {
  children: string;
}

/** A short literal: a type name, a default value, a path template. */
export interface CodeProps {
  children: string;
}

export interface CodeBlockProps {
  children: string;
  /** "json" for an example payload; absent when the source did not say. */
  language?: string | undefined;
}

export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  /** Present when the badge came from a constraint chip, for custom formatting. */
  chip?: Chip | undefined;
  /**
   * The raw value behind the badge — "get", "200", "client-sends", "wss" — for maps
   * that colour by it. `tone: "method"` says a badge is a method; this says
   * which, so a map never has to read `children` as a string. Absent where the
   * text is fixed ("required", "webhook"), and on a constraint, which has `chip`.
   */
  value?: string | undefined;
}

export interface LinkProps {
  href: string;
  target: HrefTarget;
  children: ReactNode;
}

/**
 * The container around a set of `FieldRow`s — a schema's properties, an
 * operation's parameters or a response's headers.
 *
 * Not necessarily a table. A grid, a definition list or a plain stack of rows
 * all fit; only a `<table>` brings the constraint that a row cannot nest inside
 * a row, and `FieldRowProps.children` says how to live with that.
 */
export interface FieldsProps {
  /** Lets one component serve all three, or three components serve one each. */
  kind: "fields" | "parameters" | "headers";
  children: ReactNode;
}

/**
 * One row of a field table — a schema property, a parameter or a response
 * header, which read the same way and so render the same way.
 *
 * The pre-built nodes (`name`, `type`, `chips`, `docs`) are assembled from your
 * own `Code`, `Link`, `Badge` and `Markdown`, so a row component only has to
 * decide where things go. `field` carries every underlying value for the cases
 * where that is not enough — including `field.children`, which is already
 * resolved, so nothing here implements a depth budget or cycle detection.
 */
export interface FieldRowProps {
  field: FieldNode;
  depth: number;
  name: ReactNode;
  type: ReactNode;
  chips: ReactNode;
  docs: ReactNode;
  required: boolean;
  deprecated: boolean;
  /**
   * "one of" / "all of", when this field's children are a union's branches
   * rather than its own properties. Surfaced as a prop because a reader needs
   * it and a synthetic chip would be lying about where it came from.
   */
  variantsLabel?: string | undefined;
  /** Set for a parameter row: "path" | "query" | "header" | "cookie". */
  location?: Parameter["in"] | undefined;
  /**
   * Nested rows, in `layout: "tree"`. Always absent in `layout: "rows"`.
   *
   * These are `FieldRow`s too, each carrying its own `depth`, so a map built on
   * `<tr>` — which cannot contain a `<tr>` — can return them *after* its own
   * row as siblings rather than inside it, and work in either layout.
   */
  children?: ReactNode | undefined;
}

/*
 * There is deliberately no `Disclosure`.
 *
 * The plan called for one, on the assumption that something here would need to
 * collapse a nested group. Nothing does: a `FieldRow` already receives its
 * nested rows as `children`, so whether to wrap them in a <details>, an
 * accordion or nothing at all is a decision that is already yours and is
 * already in the right place. A required slot that nothing ever calls is worse
 * than no slot — it makes the map look like it has a say it does not have.
 */

export interface Tab {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

/** Media types, response statuses, message variants. */
export interface TabsProps {
  /** What the tabs are over, for components that style the sets differently. */
  kind: "mediaType" | "status" | "message" | "example";
  tabs: Tab[];
  children?: ReactNode | undefined;
}

export interface ListProps {
  kind: "entries" | "operations" | "servers" | "security" | "tags" | "callbacks" | "links";
  children: ReactNode;
}

export interface ListItemProps {
  children: ReactNode;
}

/** Shown where the IR has nothing: an operation with no parameters, say. */
export interface EmptyProps {
  children: ReactNode;
}

export interface Components {
  Section: ComponentType<SectionProps>;
  Markdown: ComponentType<MarkdownProps>;
  Code: ComponentType<CodeProps>;
  CodeBlock: ComponentType<CodeBlockProps>;
  Badge: ComponentType<BadgeProps>;
  Link: ComponentType<LinkProps>;
  Fields: ComponentType<FieldsProps>;
  FieldRow: ComponentType<FieldRowProps>;
  Tabs: ComponentType<TabsProps>;
  List: ComponentType<ListProps>;
  ListItem: ComponentType<ListItemProps>;
  Empty: ComponentType<EmptyProps>;
}

/** Re-exported so a consumer can type a props bag without importing the IR. */
export type { Chip, Docs, FieldNode };
