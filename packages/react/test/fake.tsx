/**
 * A deliberately minimal fake component library.
 *
 * Every element it emits is a custom element named `x-…`. That is the point: a
 * test can then assert that *every* tag in the rendered output came from here,
 * which is the only honest way to show that `@speculoos/react` contributes no
 * markup, no class names and no styles of its own.
 *
 * `terse` is a second, structurally unrelated map — definition lists instead of
 * tables, flat rows instead of nesting — so the tests can show the same IR
 * driving two unrelated design systems rather than one with the serial numbers
 * filed off.
 */

import type { ReactNode } from "react";
import type { Components } from "../src/index.js";

const join = (nodes: ReactNode): ReactNode => nodes;

export const boxy: Components = {
  Section: ({ kind, id, title, subtitle, level, deprecated, children }) => (
    <x-section data-kind={kind} data-level={String(level)} {...(id ? { id } : {})}>
      <x-title>{title}</x-title>
      {subtitle !== undefined && <x-subtitle>{subtitle}</x-subtitle>}
      {deprecated === true && <x-deprecated>deprecated</x-deprecated>}
      {children}
    </x-section>
  ),
  // Deliberately *not* rendering markdown: a fake library has no sanitiser, and
  // pretending otherwise would be the one mistake this package warns about.
  Markdown: ({ children }) => <x-md>{children}</x-md>,
  Code: ({ children }) => <x-code>{children}</x-code>,
  CodeBlock: ({ children, language }) => (
    <x-pre {...(language ? { "data-lang": language } : {})}>{children}</x-pre>
  ),
  Badge: ({ tone, children }) => <x-badge data-tone={tone}>{children}</x-badge>,
  Link: ({ href, children }) => <x-link data-href={href}>{children}</x-link>,
  Fields: ({ kind, children }) => <x-fields data-kind={kind}>{children}</x-fields>,
  FieldRow: ({ field, depth, name, type, chips, docs, required, deprecated, location, variantsLabel, children }) => (
    <x-row data-depth={String(depth)} data-key={field.key}>
      <x-name>{name}</x-name>
      <x-type>{type}</x-type>
      {required && <x-required>required</x-required>}
      {deprecated && <x-deprecated>deprecated</x-deprecated>}
      {location !== undefined && <x-in>{location}</x-in>}
      {variantsLabel !== undefined && <x-variants>{variantsLabel}</x-variants>}
      <x-chips>{join(chips)}</x-chips>
      <x-docs>{docs}</x-docs>
      {children !== undefined && <x-children>{children}</x-children>}
    </x-row>
  ),
  Tabs: ({ kind, tabs }) => (
    <x-tabs data-kind={kind}>
      {tabs.map((tab) => (
        <x-tab key={tab.id} data-id={tab.id}>
          <x-label>{tab.label}</x-label>
          <x-panel>{tab.content}</x-panel>
        </x-tab>
      ))}
    </x-tabs>
  ),
  List: ({ kind, children }) => <x-list data-kind={kind}>{children}</x-list>,
  ListItem: ({ children }) => <x-item>{children}</x-item>,
  Empty: ({ children }) => <x-empty>{children}</x-empty>,
};

/** Same contract, nothing structurally in common. */
export const terse: Components = {
  Section: ({ title, children }) => (
    <y-block>
      <y-h>{title}</y-h>
      {children}
    </y-block>
  ),
  Markdown: ({ children }) => <y-text>{children}</y-text>,
  Code: ({ children }) => <y-lit>{children}</y-lit>,
  CodeBlock: ({ children }) => <y-lit>{children}</y-lit>,
  Badge: ({ children }) => <y-tag>{children}</y-tag>,
  Link: ({ children }) => <y-a>{children}</y-a>,
  Fields: ({ children }) => <y-dl>{children}</y-dl>,
  FieldRow: ({ field, name, type }) => (
    <y-dt data-depth={String(field.depth)}>
      {name}
      {type}
    </y-dt>
  ),
  Tabs: ({ tabs }) => <y-set>{tabs.map((t) => <y-one key={t.id}>{t.content}</y-one>)}</y-set>,
  List: ({ children }) => <y-ul>{children}</y-ul>,
  ListItem: ({ children }) => <y-li>{children}</y-li>,
  Empty: ({ children }) => <y-none>{children}</y-none>,
};
