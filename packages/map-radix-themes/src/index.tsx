/**
 * @speculoos/map-radix-themes — a component map for Radix Themes.
 *
 * Twelve components for `@speculoos/react`'s `Components` slots, built from
 * Radix Themes. **Not a renderer**: there is one React renderer, and this is
 * one of the maps it takes. The dependency points one way — this package knows
 * about `@speculoos/react`, and `@speculoos/react` never learns that it exists.
 *
 * Wrap the page in Radix's `<Theme>` and load `@radix-ui/themes/styles.css`;
 * this package does neither, because both are the site's decisions.
 *
 *   const components = radixThemes({ markdown: Markdown });
 *   const mine = { ...radixThemes({ markdown: Markdown }), Badge: MyBadge };
 *
 *   ./colors.ts   badge colours: every default, as data
 *   ./fields.tsx  `Fields` and `FieldRow`, as a DataList
 */

import { createContext, useContext, useState, type ComponentType, type ReactNode } from "react";
import {
  Badge,
  Box,
  Card,
  Code,
  Flex,
  Heading,
  Link,
  ScrollArea,
  Separator,
  Tabs,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@radix-ui/themes";
import type {
  BadgeProps,
  CodeBlockProps,
  CodeProps,
  Components,
  EmptyProps,
  LinkProps,
  ListItemProps,
  ListProps,
  MarkdownProps,
  SectionKind,
  SectionProps,
  TabsProps,
} from "@speculoos/react";
import { badgeColor, mergeColors, type BadgeColorOverrides } from "./colors.js";
import { fieldRow, fields, type FieldLayout, type Presence, type Size } from "./fields.js";

export type { FieldLayout, Presence } from "./fields.js";

export {
  DEFAULT_COLORS,
  type BadgeColorOverrides,
  type BadgeColors,
  type Direction,
  type HttpMethod,
  type RadixColor,
  type StatusClass,
} from "./colors.js";

export interface RadixThemesOptions {
  /**
   * Required. Renders a description, which is raw CommonMark from a document
   * you did not write. **Sanitise it.** There is no default, because a default
   * would mean this package choosing — and owning — a sanitiser.
   */
  markdown: ComponentType<MarkdownProps>;
  /** Scale of field lists, badges and tabs. Default "2". */
  size?: Size;
  /** How a field row is laid out; see `FieldLayout`. Default "stacked". */
  fieldLayout?: FieldLayout;
  /** Which of a field's states is marked; see `Presence`. Default "optional". */
  presence?: Presence;
  /** Badge colours, merged entry by entry over `DEFAULT_COLORS`. */
  colors?: BadgeColorOverrides;
  /**
   * Renders internal links — to a type, an operation, a tag — through your
   * router's link instead of a plain `<a>`, via Radix's `asChild`. External
   * links stay plain anchors. It receives `href` and `children`; wrap your
   * router's component if it wants `to` instead.
   */
  linkAs?: ComponentType<{ href: string; children: ReactNode }>;
  /**
   * Extra content for a message's card, under its title — for what your spec
   * says that Speculoos does not render. It receives the IR message, so a
   * site's own `x-` extensions are in `message.docs.extensions`:
   *
   *   messageExtras: ({ message }) =>
   *     message.docs.extensions?.["x-preview-mode"] ? <PreviewCallout /> : null
   */
  messageExtras?: ComponentType<{ message: IRMessage }>;
}

/** The IR message a message section carries, without this package importing core. */
type IRMessage = NonNullable<SectionProps["message"]>;

/** Heading size by level. A level-2 operation reads as a page section, not a title. */
const HEADING_SIZE = { 1: "8", 2: "6", 3: "5", 4: "4", 5: "3", 6: "2" } as const;

/** The regions that stand on their own: spaced apart, and separated by a rule. */
const MAJOR: ReadonlySet<SectionKind> = new Set(["api", "tag", "endpoint", "operation", "type"]);

const LIST_GAP: Record<ListProps["kind"], "1" | "2" | "3"> = {
  entries: "2",
  operations: "2",
  servers: "3",
  security: "2",
  tags: "1",
  callbacks: "3",
  links: "3",
  handshake: "2",
};

/**
 * Up for what the reader sends, down for what they receive. Prefixed to a
 * direction badge, so "client → server" reads at a glance even in a narrow
 * sidebar.
 */
const DIRECTION_ARROW: Record<string, string> = { "client-sends": "↑", "server-sends": "↓" };

/** Whether a `List` sits inside another, so a nested one can indent. */
const InList = createContext(false);

/** What the enclosing `List` is of, so an item can lay itself out to suit. */
const ListKind = createContext<ListProps["kind"] | undefined>(undefined);

/**
 * Whether a section sits inside a card (a message, the handshake). Its heading
 * then steps down, so the card's own title stays the largest thing in it.
 */
const InCard = createContext(false);

function clampLevel(level: number): 1 | 2 | 3 | 4 | 5 | 6 {
  return Math.min(Math.max(Math.round(level), 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
}

export function radixThemes(options: RadixThemesOptions): Components {
  const { markdown, size = "2", fieldLayout = "stacked", presence = "optional", linkAs, messageExtras: MessageExtras } = options;
  const colors = mergeColors(options.colors);

  function Section(props: SectionProps): ReactNode {
    if (props.kind === "message" || props.kind === "handshake") return <CardSection {...props} />;
    const { kind, id, title, subtitle, level, deprecated, children } = props;
    const inCard = useContext(InCard);
    const h = clampLevel(level);
    const major = MAJOR.has(kind);
    return (
      <Box asChild mt={major ? "7" : inCard ? "4" : "5"} mb={major ? "5" : "3"} {...(id !== undefined ? { id } : {})}>
        <section data-kind={kind}>
          <Flex direction="column" gap="2" mb={inCard ? "2" : "3"}>
            <Flex gap="3" align="center" wrap="wrap">
              <Heading as={`h${h}`} size={inCard ? "3" : HEADING_SIZE[h]}>
                {title}
              </Heading>
              {deprecated === true && <Badge color={colors.tone.deprecated}>deprecated</Badge>}
            </Flex>
            {/* Grey: the heading's marks — a path, a URL — support the title
                rather than compete with it. Badges keep their own colours. */}
            {subtitle !== undefined && (
              <Flex gap="2" align="center" wrap="wrap" style={{ color: "var(--gray-11)" }}>
                {subtitle}
              </Flex>
            )}
          </Flex>
          {children}
        </section>
      </Box>
    );
  }

  /**
   * A message is a card headed by its name. The heading keeps its level — a
   * message is a real section, with an anchor a page's prose links to — but is
   * sized down, so twenty of them read as a list rather than as twenty titles.
   * Sections inside a card step down again (see `InCard`).
   *
   * The handshake is a card too: everything about opening the connection in
   * one unit, before the first message.
   */
  function CardSection({ kind, id, title, level, deprecated, message, children }: SectionProps): ReactNode {
    const h = clampLevel(level);
    return (
      <Card asChild size="1" my="4" {...(id !== undefined ? { id } : {})}>
        <section data-kind={kind}>
          <Flex gap="3" align="center" wrap="wrap" mb="2">
            {/* The handshake is one per page and heads everything about
                connecting, so it reads as a section title; messages are many. */}
            <Heading as={`h${h}`} size={kind === "handshake" ? "5" : "4"}>
              {title}
            </Heading>
            {deprecated === true && <Badge color={colors.tone.deprecated}>deprecated</Badge>}
          </Flex>
          {MessageExtras !== undefined && message !== undefined && <MessageExtras message={message} />}
          <InCard.Provider value={true}>{children}</InCard.Provider>
        </section>
      </Card>
    );
  }

  function Markdown(props: MarkdownProps): ReactNode {
    const Body = markdown;
    return <Body {...props} />;
  }

  /**
   * A ghost: monospace, no fill, and no colour of its own, so it takes the
   * colour of what it sits in. Inside a `Link` it is link-coloured; anywhere
   * else it is body text. That is what makes a linked type (`JobStatus`)
   * distinguishable from a plain one (`integer`) — a filled, accent-coloured
   * `Code` made every type look clickable.
   */
  function SpecCode({ children }: CodeProps): ReactNode {
    return <Code variant="ghost">{children}</Code>;
  }

  /**
   * Radix has no code block. A ghost `Code` inside a `<pre>`, on a card, with a
   * horizontal scroll area so a wide payload does not widen the page.
   */
  function CodeBlock({ children, language }: CodeBlockProps): ReactNode {
    return (
      <Card variant="surface" my="3">
        <ScrollArea scrollbars="horizontal">
          <pre style={{ margin: 0 }} {...(language !== undefined ? { "data-language": language } : {})}>
            <Code variant="ghost" size="2" {...(language !== undefined ? { className: `language-${language}` } : {})}>
              {children}
            </Code>
          </pre>
        </ScrollArea>
      </Card>
    );
  }

  function SpecBadge({ tone, value, children }: BadgeProps): ReactNode {
    const arrow = tone === "direction" && value !== undefined ? DIRECTION_ARROW[value] : undefined;
    const color = badgeColor(colors, { tone, value });
    const badgeSize = size === "3" ? "2" : "1";
    // A direction is an arrow: the label ("client → server") is the tooltip,
    // and still there for a screen reader.
    if (arrow !== undefined) {
      // One size up from the other badges, square, unpadded: a circle.
      return (
        <Tooltip content={children}>
          <Badge
            color={color}
            size={size === "3" ? "3" : "2"}
            radius="full"
            style={{ width: "1.5em", height: "1.5em", padding: 0, justifyContent: "center" }}
          >
            <span aria-hidden="true">{arrow}</span>
            <VisuallyHidden>{children}</VisuallyHidden>
          </Badge>
        </Tooltip>
      );
    }
    return (
      <Badge color={color} size={badgeSize}>
        {children}
      </Badge>
    );
  }

  function SpecLink({ href, target, children }: LinkProps): ReactNode {
    if (target.kind === "external") {
      return (
        <Link href={href} rel="noopener noreferrer">
          {children}
        </Link>
      );
    }
    if (linkAs !== undefined) {
      const As = linkAs;
      return (
        <Link asChild>
          <As href={href}>{children}</As>
        </Link>
      );
    }
    return <Link href={href}>{children}</Link>;
  }

  /**
   * Media types, statuses and examples: alternative views of one thing, where
   * seeing one at a time is the point.
   */
  function SpecTabs({ kind, tabs }: TabsProps): ReactNode {
    if (kind === "examples") return <ExampleList tabs={tabs} />;
    const first = tabs[0];
    if (first === undefined) return null;
    // One tab is not a choice: its label says what the content is, and a tab
    // bar around it would be noise.
    if (tabs.length === 1) {
      return (
        <Box my="3" data-kind={kind}>
          <Flex gap="2" align="center" wrap="wrap" mb="2">
            {first.label}
          </Flex>
          {first.content}
        </Box>
      );
    }
    return (
      <Tabs.Root defaultValue={first.id} my="3" data-kind={kind}>
        <Tabs.List size={size === "1" ? "1" : "2"}>
          {tabs.map((tab) => (
            <Tabs.Trigger key={tab.id} value={tab.id}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Content key={tab.id} value={tab.id}>
            <Box pt="3">{tab.content}</Box>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    );
  }

  /**
   * Every example on an entry, as one card of rows a reader scans: each row
   * its label, opening to the example in place. Tabs would hide all but one
   * behind labels too long to sit side by side.
   */
  function ExampleList({ tabs }: Pick<TabsProps, "tabs">): ReactNode {
    return (
      <Card size="1" my="3" data-kind="examples">
        <Flex direction="column">
          {tabs.map((tab, i) => (
            <ExampleRow key={tab.id} tab={tab} first={i === 0} />
          ))}
        </Flex>
      </Card>
    );
  }

  function ExampleRow({ tab, first }: { tab: TabsProps["tabs"][number]; first: boolean }): ReactNode {
    const [open, setOpen] = useState(false);
    const body = `${tab.id}-body`;
    return (
      <Box id={tab.id}>
        {!first && <Separator size="4" my="1" />}
        <Flex asChild align="center" gap="2" width="100%" py="1" style={{ cursor: "pointer", background: "none", border: 0, textAlign: "left", font: "inherit", color: "inherit" }}>
          <button type="button" aria-expanded={open} aria-controls={body} onClick={() => setOpen((o) => !o)}>
            <Text size="1" color="gray" aria-hidden="true">{open ? "▾" : "▸"}</Text>
            <Text size="2">{tab.label}</Text>
          </button>
        </Flex>
        {/* A plain div: Radix's Box sets `display`, which beats `hidden`. */}
        <div id={body} hidden={!open}>
          {tab.content}
        </div>
      </Box>
    );
  }

  /**
   * A column of items. A list inside a list item takes the full width, so it
   * starts on its own line, and indents.
   */
  function List({ kind, children }: ListProps): ReactNode {
    const nested = useContext(InList);
    // Lists nest, and an item answers to its own list's kind.
    return (
      <Flex asChild direction="column" gap={LIST_GAP[kind]} my={nested ? "1" : "3"} p="0" pl={nested ? "3" : "0"} width="100%">
        <ul style={{ listStyle: "none" }} data-kind={kind}>
          <InList.Provider value={true}>
            <ListKind.Provider value={kind}>{children}</ListKind.Provider>
          </InList.Provider>
        </ul>
      </Flex>
    );
  }

  /**
   * An item lays out its parts in a row. A security alternative is stacked like
   * a field row instead — a rule above, the scheme and how to send it on one
   * line, its description under them — because it is read like one: as a
   * block layout, the inline badge and code share a line and the description,
   * a block, takes the next.
   */
  function ListItem({ children }: ListItemProps): ReactNode {
    if (useContext(ListKind) === "security") {
      return (
        <Box asChild pt="3" style={{ borderTop: "1px solid var(--gray-a4)" }}>
          <li>{children}</li>
        </Box>
      );
    }
    return (
      <Flex asChild gap="2" align="center" wrap="wrap">
        <li>{children}</li>
      </Flex>
    );
  }

  function Empty({ children }: EmptyProps): ReactNode {
    return (
      <Text as="p" color="gray" size="2">
        {children}
      </Text>
    );
  }

  return {
    Section,
    Markdown,
    Code: SpecCode,
    CodeBlock,
    Badge: SpecBadge,
    Link: SpecLink,
    Fields: fields(size, fieldLayout),
    FieldRow: fieldRow(colors, fieldLayout, presence),
    Tabs: SpecTabs,
    List,
    ListItem,
    Empty,
  };
}
