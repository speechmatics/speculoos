/**
 * Loading a *project* of documents.
 *
 * The unit of a build is a project, not a document. If two specs both reference
 * a shared `common.yaml` and each is loaded on its own, the shared schema ends
 * up duplicated — two registry entries, two anchors, no "referenced by". So the
 * loader takes N documents and resolves refs across all of them at once.
 *
 * It bundles rather than dereferences, and in fact does not rewrite documents at
 * all: refs are resolved on demand to a canonical `{ document, pointer }`. That
 * keeps identity anchored to where a schema is *defined*, which is what makes
 * one shared type come out as one type.
 */

import type { Diagnostic, SourceLocation } from "@speculoos/core";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from "node:path";
import { parseDocument } from "yaml";
import { at } from "./pointer.js";
import { detectDialect, type DialectInfo } from "./dialect.js";

export interface DocumentInput {
  /**
   * Stable logical name. It appears in every TypeId and therefore in every URL,
   * so it must not be derived from an absolute filesystem path.
   */
  name: string;
  /** Path to read, absolute or relative to `root`. */
  path?: string;
  /** Raw text or pre-parsed data, for documents that are not on disk. */
  content?: string | unknown;
}

export interface ProjectInput {
  documents: DocumentInput[];
  /** Base for resolving relative paths and for naming discovered documents. */
  root?: string;
  /**
   * Off by default. Fetching arbitrary URLs during a docs build is a
   * supply-chain surface, so it has to be asked for.
   */
  allowRemoteRefs?: boolean;
}

export interface LoadedDocument {
  name: string;
  data: unknown;
  /** Absolute path, when loaded from disk. Never reaches the IR. */
  path?: string;
  dialect?: DialectInfo;
}

export interface LoadedProject {
  /** Every document, including ones discovered through refs. */
  documents: LoadedDocument[];
  /** Only the ones the caller named. */
  entry: LoadedDocument[];
  diagnostics: Diagnostic[];
  /** Canonical location a `$ref` at `from` points at. */
  resolve(ref: string, from: SourceLocation): SourceLocation | undefined;
  /** Raw value at a location. */
  at(loc: SourceLocation): unknown;
  document(name: string): LoadedDocument | undefined;
}

export async function load(input: ProjectInput): Promise<LoadedProject> {
  const root = resolvePath(input.root ?? process.cwd());
  const diagnostics: Diagnostic[] = [];
  const byName = new Map<string, LoadedDocument>();
  const byPath = new Map<string, LoadedDocument>();

  const report = (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    document: string,
    pointer = "",
  ): void => {
    diagnostics.push({ severity, code, message, source: { document, pointer } });
  };

  const register = (doc: LoadedDocument): void => {
    byName.set(doc.name, doc);
    if (doc.path !== undefined) byPath.set(doc.path, doc);
  };

  const entry: LoadedDocument[] = [];
  for (const spec of input.documents) {
    if (isAbsolute(spec.name) || spec.name.includes(sep)) {
      report("error", "BAD_DOCUMENT_NAME", `Document name "${spec.name}" looks like a path. Names appear in every URL and must be stable across machines.`, spec.name);
      continue;
    }
    const doc = await loadOne(spec, root, report);
    if (doc === undefined) continue;
    register(doc);
    entry.push(doc);
  }

  // Transitively pull in whatever the entry documents reference.
  const queue = [...entry];
  while (queue.length > 0) {
    const doc = queue.shift()!;
    for (const ref of collectRefs(doc.data)) {
      const uri = ref.split("#", 1)[0] ?? "";
      if (uri === "") continue;

      if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
        if (input.allowRemoteRefs !== true) {
          report("error", "REMOTE_REF_DISABLED", `Remote $ref "${uri}" was not followed. Pass allowRemoteRefs to enable it.`, doc.name);
        } else {
          report("error", "REMOTE_REF_UNSUPPORTED", `Remote $ref "${uri}" cannot be followed: remote loading is not implemented yet.`, doc.name);
        }
        continue;
      }

      if (doc.path === undefined) {
        report("error", "NO_BASE_PATH", `Cannot resolve "${uri}" from in-memory document "${doc.name}", which has no path to resolve against.`, doc.name);
        continue;
      }

      const target = resolvePath(dirname(doc.path), decodeURIComponent(uri));
      if (byPath.has(target)) continue;

      const name = nameForDiscovered(target, root);
      const loaded = await loadOne({ name, path: target }, root, report);
      if (loaded === undefined) continue;
      register(loaded);
      queue.push(loaded);
    }
  }

  const resolveRef = (ref: string, from: SourceLocation): SourceLocation | undefined => {
    const hash = ref.indexOf("#");
    const uri = hash === -1 ? ref : ref.slice(0, hash);
    const pointer = hash === -1 ? "" : ref.slice(hash + 1);

    let target: LoadedDocument | undefined;
    if (uri === "") {
      target = byName.get(from.document);
    } else {
      const base = byName.get(from.document)?.path;
      if (base === undefined) return undefined;
      target = byPath.get(resolvePath(dirname(base), decodeURIComponent(uri)));
    }
    if (target === undefined) return undefined;
    if (at(target.data, pointer) === undefined) return undefined;
    return { document: target.name, pointer };
  };

  return {
    documents: [...byName.values()],
    entry,
    diagnostics,
    resolve: resolveRef,
    at: (loc) => at(byName.get(loc.document)?.data, loc.pointer),
    document: (name) => byName.get(name),
  };
}

type Report = (
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  document: string,
  pointer?: string,
) => void;

async function loadOne(
  spec: DocumentInput,
  root: string,
  report: Report,
): Promise<LoadedDocument | undefined> {
  let data: unknown;
  let path: string | undefined;

  if (spec.content !== undefined) {
    if (typeof spec.content === "string") {
      const parsed = parseText(spec.content, spec.name, report);
      if (parsed === undefined) return undefined;
      data = parsed;
    } else {
      data = spec.content;
    }
    if (spec.path !== undefined) path = resolvePath(root, spec.path);
  } else if (spec.path !== undefined) {
    path = resolvePath(root, spec.path);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      report("error", "DOCUMENT_UNREADABLE", `Cannot read ${spec.path}: ${(error as Error).message}`, spec.name);
      return undefined;
    }
    const parsed = parseText(text, spec.name, report);
    if (parsed === undefined) return undefined;
    data = parsed;
  } else {
    report("error", "DOCUMENT_EMPTY", `Document "${spec.name}" has neither a path nor content`, spec.name);
    return undefined;
  }

  const dialect = detectDialect(data);
  if ("error" in dialect) {
    // Not fatal: a document may legitimately be a bare schema file that another
    // document refs into. The adapter decides whether it needed a dialect.
    report("info", "NO_DIALECT", dialect.error, spec.name);
    return { name: spec.name, data, ...(path !== undefined && { path }) };
  }

  return { name: spec.name, data, dialect, ...(path !== undefined && { path }) };
}

/** Parses YAML (a superset of JSON), reporting syntax errors with a position. */
function parseText(text: string, name: string, report: Report): unknown {
  const parsed = parseDocument(text, { prettyErrors: true });
  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      const [line, col] = error.linePos?.[0] ? [error.linePos[0].line, error.linePos[0].col] : [0, 0];
      report("error", "PARSE_ERROR", `${error.message} (line ${line}, column ${col})`, name);
    }
    return undefined;
  }
  return parsed.toJS({ maxAliasCount: 1000 });
}

/**
 * A discovered document's name is its path relative to the project root, in
 * posix form. Deterministic across machines, which an absolute path is not.
 */
function nameForDiscovered(target: string, root: string): string {
  const rel = relative(root, target);
  const normalised = rel.split(sep).join("/");
  return normalised.startsWith("..") ? target.split(sep).join("/") : normalised;
}

/** Every `$ref` string anywhere in a document. */
function collectRefs(data: unknown): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const v of value) visit(v);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (key === "$ref" && typeof v === "string") out.push(v);
      else visit(v);
    }
  };
  visit(data);
  return out;
}
