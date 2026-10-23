/**
 * The named-type registry.
 *
 * Types are registered lazily, as refs to them are encountered. Registration
 * happens in two steps — reserve the id, then fill the node — so that a schema
 * which refers to itself finds its own id already present and terminates.
 *
 * Identity follows the *definition's* canonical location, never the referrer's.
 * Two documents referencing one shared schema therefore land on one TypeId, one
 * entry and one anchor.
 */

import type { Diagnostic, SourceLocation, TypeDef, TypeId, TypeRegistry } from "@speculoos/core";
import { createSlugger } from "@speculoos/core";
import type { Node } from "@speculoos/core";
import { isObject, str } from "./canonical.js";
import { extractDocs } from "./lower.js";

/** Resolves a `$ref` string against the document it appears in. */
export interface Resolver {
  /** The canonical location a ref points at, or undefined if unresolvable. */
  resolve(ref: string, from: SourceLocation): SourceLocation | undefined;
  /** The raw (pre-upcast) schema at a location. */
  at(loc: SourceLocation): unknown;
}

export type Lowerer = (schema: unknown, loc: SourceLocation) => Node;

export function typeIdOf(loc: SourceLocation): TypeId {
  return `${loc.document}#${loc.pointer}`;
}

/** Display name for a type: its `title`, else the last pointer segment. */
export function typeNameOf(loc: SourceLocation, schema: unknown): string {
  if (isObject(schema)) {
    const title = str(schema, "title");
    if (title !== undefined && title.trim() !== "") return title;
  }
  const segments = loc.pointer.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last === undefined ? loc.document : unescapePointer(last);
}

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export class Registry {
  private readonly defs = new Map<TypeId, TypeDef>();
  private readonly pending = new Set<TypeId>();
  private readonly referencedBy = new Map<TypeId, Set<TypeId>>();
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly resolver: Resolver,
    private readonly lower: Lowerer,
  ) {}

  report(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  /**
   * Resolves a ref and returns the registry id for its target, lowering the
   * target on first sight. `from` is recorded for "referenced by" back-links.
   */
  typeIdFor(ref: string, from: SourceLocation): TypeId | undefined {
    const target = this.resolver.resolve(ref, from);
    if (target === undefined) return undefined;

    const id = typeIdOf(target);
    this.note(id, from);
    if (this.defs.has(id) || this.pending.has(id)) return id;

    this.pending.add(id);
    const schema = this.resolver.at(target);
    const node = this.lower(schema, target);
    this.pending.delete(id);

    this.defs.set(id, {
      id,
      name: typeNameOf(target, schema),
      slug: "", // assigned over the completed registry; see finish()
      node,
      docs: isObject(schema) ? extractDocs(schema) : {},
      source: target,
      referencedBy: [],
    });
    return id;
  }

  /**
   * The entry for an id, if it has been registered. Adapters need this to look
   * through a `$ref` while still building — a message payload is almost always
   * a ref, and anything that inspects the payload's shape has to follow it.
   */
  peek(id: TypeId): TypeDef | undefined {
    return this.defs.get(id);
  }

  /** Registers a type eagerly, for things the adapter knows are named up front. */
  declare(loc: SourceLocation): TypeId {
    const id = typeIdOf(loc);
    if (this.defs.has(id) || this.pending.has(id)) return id;
    this.pending.add(id);
    const schema = this.resolver.at(loc);
    const node = this.lower(schema, loc);
    this.pending.delete(id);
    this.defs.set(id, {
      id,
      name: typeNameOf(loc, schema),
      slug: "",
      node,
      docs: isObject(schema) ? extractDocs(schema) : {},
      source: loc,
      referencedBy: [],
    });
    return id;
  }

  private note(target: TypeId, from: SourceLocation): void {
    // Attribute the reference to the enclosing named type, when there is one.
    const owner = this.ownerOf(from);
    if (owner === undefined || owner === target) return;
    const set = this.referencedBy.get(target) ?? new Set();
    set.add(owner);
    this.referencedBy.set(target, set);
  }

  /** The registered type whose pointer is the longest prefix of `loc`. */
  private ownerOf(loc: SourceLocation): TypeId | undefined {
    let best: TypeId | undefined;
    let bestLength = -1;
    for (const id of [...this.defs.keys(), ...this.pending]) {
      const hash = id.indexOf("#");
      if (id.slice(0, hash) !== loc.document) continue;
      const pointer = id.slice(hash + 1);
      if (!loc.pointer.startsWith(pointer)) continue;
      if (pointer.length > bestLength) {
        best = id;
        bestLength = pointer.length;
      }
    }
    return best;
  }

  /**
   * Finalises the registry: assigns slugs over the whole set (collisions cannot
   * be broken per type) and fills in back-links. Entries are sorted by id so the
   * output is reproducible whatever order refs happened to be encountered in.
   */
  finish(): TypeRegistry {
    const slug = createSlugger();
    const out: TypeRegistry = {};
    for (const id of [...this.defs.keys()].sort()) {
      const def = this.defs.get(id)!;
      out[id] = {
        ...def,
        slug: slug(def.name),
        referencedBy: [...(this.referencedBy.get(id) ?? [])].sort(),
      };
    }
    return out;
  }
}
