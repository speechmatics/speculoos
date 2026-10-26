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

import { Fragment, type ComponentType, type ReactNode } from "react";
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
import { fieldRow, fields, type Size } from "./fields.js";

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
  /** Badge colours, merged entry by entry over `DEFAULT_COLORS`. */
  colors?: BadgeColorOverrides;
  /**
   * Renders internal links — to a type, an operation, a tag — through your
   * router's link instead of a plain `<a>`, via Radix's `asChild`. External
   * links stay plain anchors. It receives `href` and `children`; wrap your
   * router's component if it wants `to` instead.
   */
  linkAs?: ComponentType<{ href: string; children: ReactNode }>;
}

/** Heading size by level. A level-2 operation reads as a page section, not a title. */
const HEADING_SIZE = { 1: "8", 2: "6", 3: "5", 4: "4", 5: "3", 6: "2" } as const;

/** The regions that stand on their own: spaced apart, and separated by a rule. */
const MAJOR: ReadonlySet<SectionKind> = new Set(["api", "tag", "endpoint", "operation", "type"]);

const LIST_GAP: Record<ListProps["kind"], "1" | "2" | "3"> = {
  operations: "2",
  servers: "3",
  security: "2",
  tags: "1",
  callbacks: "3",
  links: "3",
};

function clampLevel(level: number): 1 | 2 | 3 | 4 | 5 | 6 {
  return Math.min(Math.max(Math.round(level), 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
}

export function radixThemes(options: RadixThemesOptions): Components {
  const { markdown, size = "2", linkAs } = options;
  const colors = mergeColors(options.colors);

  function Section({ kind, id, title, subtitle, level, deprecated, children }: SectionProps): ReactNode {
    const h = clampLevel(level);
    const major = MAJOR.has(kind);
    return (
      <Box asChild mt={major ? "7" : "5"} mb={major ? "5" : "3"} {...(id !== undefined ? { id } : {})}>
        <section data-kind={kind}>
          <Flex direction="column" gap="2" mb="3">
            <Flex gap="3" align="center" wrap="wrap">
              <Heading as={`h${h}`} size={HEADING_SIZE[h]}>
                {title}
              </Heading>
              {deprecated === true && <Badge color={colors.tone.deprecated}>deprecated</Badge>}
            </Flex>
            {subtitle !== undefined && (
              <Flex gap="2" align="center" wrap="wrap">
                {subtitle}
              </Flex>
            )}
          </Flex>
          {children}
        </section>
      </Box>
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
    return (
      <Badge color={badgeColor(colors, { tone, value })} size={size === "3" ? "2" : "1"}>
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
   * Media types, statuses and examples are tabs: alternative views of one
   * thing, where seeing one at a time is the point.
   *
   * Messages are not. The messages on a channel are distinct things a reader
   * needs to compare — "I may send any of these" — so they are stacked, each
   * on its own card, with "or" between them. One message is still a card.
   */
  function SpecTabs({ kind, tabs }: TabsProps): ReactNode {
    if (kind === "message") return <Alternatives tabs={tabs} />;
    const first = tabs[0];
    if (first === undefined) return null;
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

  function Alternatives({ tabs }: Pick<TabsProps, "tabs">): ReactNode {
    return (
      <Flex direction="column" gap="3" my="3" data-kind="message">
        {tabs.map((tab, i) => (
          <Fragment key={tab.id}>
            {i > 0 && <Or />}
            <Card size="2">
              <Text as="div" size="3" weight="bold" mb="2">
                {tab.label}
              </Text>
              {tab.content}
            </Card>
          </Fragment>
        ))}
      </Flex>
    );
  }

  function List({ kind, children }: ListProps): ReactNode {
    return (
      <Flex asChild direction="column" gap={LIST_GAP[kind]} my="3" p="0">
        <ul style={{ listStyle: "none" }} data-kind={kind}>
          {children}
        </ul>
      </Flex>
    );
  }

  function ListItem({ children }: ListItemProps): ReactNode {
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
    Fields: fields(size),
    FieldRow: fieldRow(colors),
    Tabs: SpecTabs,
    List,
    ListItem,
    Empty,
  };
}

/** The divider between alternatives: a rule, the word, a rule. */
function Or(): ReactNode {
  return (
    <Flex align="center" gap="3">
      <Separator size="4" style={{ flex: 1 }} />
      <Text size="1" color="gray" weight="medium">
        or
      </Text>
      <Separator size="4" style={{ flex: 1 }} />
    </Flex>
  );
}
