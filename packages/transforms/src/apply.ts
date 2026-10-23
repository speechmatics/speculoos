/**
 * Running a transform pipeline.
 *
 * A transform is `(ir) => ir`. That is the whole contract, so a consumer's own
 * one-off pass is a first-class citizen alongside the built-ins and needs no
 * registration anywhere.
 */

import type { ApiIR } from "@speculoos/core";

export interface Transform {
  (ir: ApiIR): ApiIR;
  /** Shown in errors. Built-ins set it; plain functions fall back to `fn.name`. */
  displayName?: string;
}

/**
 * Thrown when `validate` is on and a transform returned something that is no
 * longer an `ApiIR`. Naming the transform matters more than it sounds: by the
 * time a pipeline of six passes produces invalid IR, "which one" is the only
 * question worth answering.
 */
export class TransformError extends Error {
  constructor(
    readonly transform: string,
    readonly step: number,
    override readonly cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Transform ${transform} (step ${step + 1}) produced invalid IR:\n${detail}`);
    this.name = "TransformError";
  }
}

export interface ApplyOptions {
  /**
   * Called after every transform; throw to reject. Pass `parseApiIR` from
   * `@speculoos/core/validate`.
   *
   * It is a parameter rather than a built-in because validation needs `ajv`,
   * and this package has no runtime dependencies. It is also the only honest
   * place to put it: a consumer running one cheap pass over a 13 MB IR should
   * not pay for schema validation they did not ask for.
   */
  validate?: (ir: ApiIR) => unknown;
}

export function nameOf(t: Transform): string {
  return t.displayName ?? (t.name || "anonymous");
}

/** Applies transforms left to right. */
export function applyTransforms(
  ir: ApiIR,
  transforms: readonly Transform[],
  opts: ApplyOptions = {},
): ApiIR {
  let current = ir;
  transforms.forEach((transform, step) => {
    const next = transform(current);
    if (opts.validate) {
      try {
        opts.validate(next);
      } catch (cause) {
        throw new TransformError(nameOf(transform), step, cause);
      }
    }
    current = next;
  });
  return current;
}

/** Marks a function as a named transform. Used by every built-in below. */
export function named<T extends Transform>(displayName: string, fn: T): T {
  Object.defineProperty(fn, "displayName", { value: displayName });
  return fn;
}
