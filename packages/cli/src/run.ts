/**
 * Loading and building, with dialect dispatch.
 *
 * The adapter is chosen from what the document declares, not from a flag: a
 * build that needs to be told what it is reading would be one more thing to get
 * out of step with the file.
 */

import { buildAsyncApi } from "@speculoos/asyncapi";
import type { ApiIR, Diagnostic } from "@speculoos/core";
import { parseApiIR } from "@speculoos/core/validate";
import { type DocumentInput, load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { applyTransforms, type Transform } from "@speculoos/transforms";

export interface RunOptions {
  specs: DocumentInput[];
  root: string;
  allowRemoteRefs?: boolean;
  /** IR-to-IR passes, applied in order after the adapter has run. */
  transforms?: Transform[];
  /**
   * Validate after each transform. Off by default: it costs a schema
   * compilation and a full walk, and the adapters are already trusted to emit
   * valid IR — it is user-supplied passes that are worth checking.
   */
  validate?: boolean;
}

export interface RunResult {
  ir?: ApiIR;
  diagnostics: Diagnostic[];
}

export async function run({ specs, root, allowRemoteRefs, transforms, validate }: RunOptions): Promise<RunResult> {
  const project = await load({
    root,
    documents: specs,
    ...(allowRemoteRefs === true && { allowRemoteRefs: true }),
  });

  const fatal = project.diagnostics.filter((d) => d.severity === "error");
  if (project.entry.length === 0 || fatal.length > 0) {
    return { diagnostics: project.diagnostics };
  }

  const entry = project.entry[0]!;
  const family = entry.dialect?.family;

  const transform = (ir: ApiIR): RunResult => ({
    ir: applyTransforms(ir, transforms ?? [], validate === true ? { validate: parseApiIR } : {}),
    diagnostics: [],
  });

  if (family === "openapi") {
    return transform(buildOpenApi({ project, document: entry.name }));
  }

  if (family === "asyncapi") {
    return transform(buildAsyncApi({ project, document: entry.name }));
  }

  return {
    diagnostics: [
      ...project.diagnostics,
      {
        severity: "error",
        code: "UNKNOWN_DIALECT",
        message: `Cannot tell what "${entry.name}" is. It must declare \`openapi\` or \`asyncapi\`.`,
        source: { document: entry.name, pointer: "" },
      },
    ],
  };
}
