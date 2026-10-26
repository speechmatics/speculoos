/**
 * The dev page. Every control here is a real option, so what you see is what
 * a consumer would get from the same settings.
 */

import { StrictMode, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Box, Code, Flex, Heading, Link, ScrollArea, SegmentedControl, Select, Separator, Text, Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { entrySlug } from "@speculoos/core";
import {
  Entry,
  EntryList,
  SpeculoosProvider,
  TypeSections,
  useEntries,
  useSpeculoos,
  type HrefTarget,
  type MarkdownProps,
} from "@speculoos/react";
import specs from "virtual:speculoos-specs";
import { radixThemes } from "../src/index.js";

/**
 * How a consumer is meant to wire markdown: a renderer they chose, a sanitiser
 * they chose, and their own design system's typography for the elements.
 */
function Markdown({ children }: MarkdownProps): ReactNode {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeSanitize]}
      components={{
        p: ({ children }) => (
          <Text as="p" size="2" mb="2">
            {children}
          </Text>
        ),
        a: ({ href, children }) => <Link href={href ?? "#"}>{children}</Link>,
        code: ({ children }) => <Code>{children}</Code>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

type Layout = "tree" | "rows";
type Appearance = "light" | "dark";

/** Settings live in the query string, so a view can be linked to and reloaded. */
function useParam<T extends string>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => (new URLSearchParams(location.search).get(key) as T | null) ?? initial);
  const set = (next: T) => {
    const params = new URLSearchParams(location.search);
    params.set(key, next);
    history.replaceState(null, "", `?${params.toString()}${location.hash}`);
    setValue(next);
  };
  return [value, set];
}

type Pages = "one" | "per-entry";

/**
 * A URL in this dev page, keeping the current settings and changing `page`.
 * Stands in for whatever router a real site has.
 */
function pageUrl(page: string, hash?: string): string {
  const params = new URLSearchParams(location.search);
  params.set("page", page);
  return `?${params.toString()}${hash === undefined ? "" : `#${hash}`}`;
}

/**
 * One page per API reference entry — `POST /projects`, `WSS /v2/{language}` —
 * plus a page of types, from nothing but an `href` function. Speculoos asks
 * where each target lives and the site answers. A REST operation is a page; an
 * operation on a channel lives on its channel's page, at its own anchor.
 */
const perEntryHref = (target: HrefTarget): string | undefined => {
  switch (target.kind) {
    case "endpoint":
      // A channel is a page. A REST path is not, so it goes to its first operation.
      return target.endpoint.addressKind === "channel"
        ? pageUrl(target.endpoint.slug)
        : target.endpoint.operations[0] === undefined
          ? undefined
          : pageUrl(target.endpoint.operations[0].slug);
    case "operation":
      return target.endpoint.addressKind === "channel"
        ? pageUrl(target.endpoint.slug, target.operation.slug)
        : pageUrl(target.operation.slug);
    case "type":
      return target.def === undefined ? undefined : pageUrl("types", target.def.slug);
    case "tag":
      return undefined;
    case "external":
      return target.url;
  }
};

/** Everything on one page: every entry, then every type. */
function OnePage(): ReactNode {
  const { ir } = useSpeculoos();
  const entries = useEntries();
  return (
    <>
      <Heading as="h1" size="8">
        {ir.info.title} <Text color="gray">{ir.info.version}</Text>
      </Heading>
      {entries.map((entry) => (
        <Entry key={entrySlug(entry)} entry={entry} />
      ))}
      <Separator size="4" my="7" />
      <Heading as="h2" size="7">
        Types
      </Heading>
      <TypeSections level={3} />
    </>
  );
}

/** One entry, or the types, as its own page — what a routed site would render. */
function RoutedPage({ page }: { page: string }): ReactNode {
  const entries = useEntries();
  if (page === "types") {
    return (
      <>
        <Heading as="h1" size="8">
          Types
        </Heading>
        <TypeSections level={2} />
      </>
    );
  }
  const entry = entries.find((e) => entrySlug(e) === page) ?? entries[0];
  return entry === undefined ? <Text>No entries.</Text> : <Entry entry={entry} level={1} />;
}

function App(): ReactNode {
  const [spec, setSpec] = useParam("spec", specs[0]?.name ?? "");
  const [layout, setLayout] = useParam<Layout>("layout", "tree");
  const [appearance, setAppearance] = useParam<Appearance>("appearance", "light");
  const [pages, setPages] = useParam<Pages>("pages", "one");
  const page = new URLSearchParams(location.search).get("page") ?? "";

  const current = specs.find((s) => s.name === spec) ?? specs[0];
  const components = useMemo(() => radixThemes({ markdown: Markdown }), []);
  const options = useMemo(
    () => (pages === "per-entry" ? { layout, href: perEntryHref } : { layout }),
    [layout, pages],
  );
  // A routed page that was scrolled to an anchor before React rendered it.
  useEffect(() => {
    if (location.hash !== "") document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [page]);
  if (current === undefined) return <Text>No specs.</Text>;

  return (
    <Theme appearance={appearance} accentColor="iris" grayColor="slate" panelBackground="solid">
      <SpeculoosProvider ir={current.ir} components={components} options={options}>
        <Flex style={{ height: "100vh" }}>
          <Box width="320px" style={{ borderRight: "1px solid var(--gray-a5)", flexShrink: 0 }}>
            <ScrollArea>
              <Flex direction="column" gap="3" p="4">
                <Text weight="bold">Speculoos × Radix Themes</Text>
                <Select.Root value={current.name} onValueChange={setSpec}>
                  <Select.Trigger />
                  <Select.Content>
                    {specs.map((s) => (
                      <Select.Item key={s.name} value={s.name}>
                        {s.title}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Control label="Pages" value={pages} values={["one", "per-entry"]} onChange={setPages} />
                <Control label="Layout" value={layout} values={["tree", "rows"]} onChange={setLayout} />
                <Control label="Appearance" value={appearance} values={["light", "dark"]} onChange={setAppearance} />
                <Separator size="4" />
                <EntryList />
                {pages === "per-entry" && <Link href={pageUrl("types")}>Types</Link>}
              </Flex>
            </ScrollArea>
          </Box>
          <Box flexGrow="1">
            <ScrollArea>
              <Box p="6" maxWidth="1100px">
                {pages === "per-entry" ? <RoutedPage page={page} /> : <OnePage />}
              </Box>
            </ScrollArea>
          </Box>
        </Flex>
      </SpeculoosProvider>
    </Theme>
  );
}

function Control<T extends string>({ label, value, values, onChange }: {
  label: string;
  value: T;
  values: T[];
  onChange: (value: T) => void;
}): ReactNode {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        {label}
      </Text>
      <SegmentedControl.Root value={value} onValueChange={(v) => onChange(v as T)} size="1">
        {values.map((v) => (
          <SegmentedControl.Item key={v} value={v}>
            {v}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
    </Flex>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
