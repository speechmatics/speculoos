/** RFC 6901 JSON pointers. */

export function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function escapeSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Reads the value at `pointer` in `doc`, or undefined if the path is absent. */
export function at(doc: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "#") return doc;
  const path = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (path === "") return doc;
  if (!path.startsWith("/")) return undefined;

  let current: unknown = doc;
  for (const raw of path.split("/").slice(1)) {
    const key = unescapeSegment(raw);
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== "object") return undefined;
    if (!Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function joinPointer(pointer: string, ...segments: string[]): string {
  return pointer + segments.map((s) => `/${escapeSegment(s)}`).join("");
}
