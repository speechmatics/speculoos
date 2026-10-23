/**
 * The fake libraries emit custom elements so the tests can prove that every tag
 * in the output came from a component map. React's types do not know them, so
 * they are declared here rather than in the fake itself.
 */
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type FakeElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> &
  Record<string, unknown>;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tag: `x-${string}`]: FakeElement;
      [tag: `y-${string}`]: FakeElement;
    }
  }
}
