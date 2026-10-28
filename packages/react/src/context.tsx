/**
 * The provider: an IR, a component map, and the handful of decisions that are
 * the site's rather than the spec's.
 */

import { type ApiIR, defaultHref, type HrefTarget, type View } from "@speculoos/core";
import { createContext, createElement, type ReactNode, useContext, useMemo } from "react";
import type { Components } from "./components.js";

export interface SpeculoosOptions {
  /**
   * What to do at a `$ref`. "never" links to the type's own section and is the
   * default, because a named type has a section and repeating it is noise.
   */
  expandRefs?: "never" | "depth" | "always";
  /** Only consulted when `expandRefs` is "depth". Default 2. */
  maxDepth?: number;
  /**
   * "tree" nests rows inside their parent; "rows" hands your `Fields` a flat
   * pre-order list carrying `depth`, for design systems that cannot put a
   * table row inside a table row. Default "tree".
   */
  layout?: "tree" | "rows";
  /**
   * Where links point. The default is `#slug`, from the IR's own slugs, which
   * is right for a single page and wrong for everything else — a site with a
   * page per operation replaces this and nothing else.
   */
  href?: (target: HrefTarget) => string | undefined;
  /** Heading level the outermost `Section` renders at. Default 2. */
  headingLevel?: number;
  /** Bucket name for operations carrying no declared tag. Default "Other". */
  untaggedLabel?: string;
  /**
   * Whether examples render under the payload they belong to. Turn it off when
   * the page gathers them in one place with `<EntryExamples>`. Default true.
   */
  inlineExamples?: boolean;
}

export interface SpeculoosContextValue {
  ir: ApiIR;
  components: Components;
  options: Required<Omit<SpeculoosOptions, "href">> & {
    href: (target: HrefTarget) => string | undefined;
  };
}

/** Same-page anchors from the IR's own slugs. Shared with the HTML renderer. */
export { defaultHref } from "@speculoos/core";

const Context = createContext<SpeculoosContextValue | undefined>(undefined);

export interface SpeculoosProviderProps {
  ir: ApiIR;
  components: Components;
  options?: SpeculoosOptions;
  children?: ReactNode;
}

export function SpeculoosProvider({ ir, components, options, children }: SpeculoosProviderProps): ReactNode {
  const value = useMemo<SpeculoosContextValue>(
    () => ({
      ir,
      components,
      options: {
        expandRefs: options?.expandRefs ?? "never",
        maxDepth: options?.maxDepth ?? 2,
        layout: options?.layout ?? "tree",
        headingLevel: options?.headingLevel ?? 2,
        untaggedLabel: options?.untaggedLabel ?? "Other",
        inlineExamples: options?.inlineExamples ?? true,
        href: options?.href ?? defaultHref,
      },
    }),
    [
      ir,
      components,
      options?.expandRefs,
      options?.maxDepth,
      options?.layout,
      options?.headingLevel,
      options?.untaggedLabel,
      options?.inlineExamples,
      options?.href,
    ],
  );
  return createElement(Context.Provider, { value }, children);
}

export function useSpeculoos(): SpeculoosContextValue {
  const value = useContext(Context);
  if (value === undefined) {
    throw new Error("Speculoos components must be rendered inside a <SpeculoosProvider>.");
  }
  return value;
}

/** The component map in context: render through it to look like the shipped components. */
export function useComponents(): Components {
  return useSpeculoos().components;
}

/** Resolves a link target through `options.href`. */
export function useHref(target: HrefTarget | undefined): string | undefined {
  const { options } = useSpeculoos();
  return target === undefined ? undefined : options.href(target);
}

/** The view a node should be projected in, defaulting to neutral. */
export type ViewHint = View;
