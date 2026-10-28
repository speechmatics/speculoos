/**
 * Renaming named types.
 *
 * The `TypeId` is deliberately *not* rewritten. An id is source identity —
 * `batch#/components/schemas/Job` says where the definition lives, every
 * `RefNode.target` and `composedFrom` entry quotes it, and `SourceLocation`
 * agrees with it. `name` and `slug` are presentation, and presentation is the
 * thing a docs site wants to override. Keeping the two apart means a rename
 * cannot break a reference.
 */

import { slugify } from "@speculoos/core";
import type { ApiIR, TypeDef, TypeId, TypeRegistry } from "@speculoos/core";
import { named, type Transform } from "./apply.js";

/**
 * Keys may be a `TypeId` or a current display name; an id wins when both match,
 * because a bare name can be ambiguous across documents and an id never is.
 */
export type RenameMap = Readonly<Record<string, string>>;

/**
 * Renames types and reassigns their slugs.
 *
 * Untouched types keep the slug they already had — re-slugging the whole
 * registry would silently move the anchors of types nobody renamed, and those
 * anchors are URLs somebody has already linked to.
 */
export const renameTypes = (map: RenameMap): Transform =>
  named("renameTypes", (ir: ApiIR): ApiIR => {
    const newName = (id: TypeId, def: TypeDef): string | undefined => map[id] ?? map[def.name];

    const ids = Object.keys(ir.schemas).sort();
    const renamed = new Set<TypeId>();
    for (const id of ids) {
      const def = ir.schemas[id] as TypeDef;
      const next = newName(id, def);
      if (next !== undefined && next !== def.name) renamed.add(id);
    }
    if (renamed.size === 0) return ir;

    const taken = new Set<string>();
    for (const id of ids) {
      if (!renamed.has(id)) taken.add((ir.schemas[id] as TypeDef).slug);
    }
    const assign = (name: string): string => {
      const base = slugify(name);
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      taken.add(slug);
      return slug;
    };

    const schemas: TypeRegistry = {};
    for (const id of Object.keys(ir.schemas)) {
      const def = ir.schemas[id] as TypeDef;
      if (!renamed.has(id)) {
        schemas[id] = def;
        continue;
      }
      const name = newName(id, def) as string;
      schemas[id] = { ...def, name, slug: assign(name) };
    }
    return { ...ir, schemas };
  });
