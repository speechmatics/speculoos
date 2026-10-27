/**
 * Which Radix colour a badge gets.
 *
 * Every default is here, as data, so the README can show it and a consumer can
 * override one entry without restating the rest. `BadgeProps.value` is what
 * makes this possible: `tone` says a badge is a method, `value` says which.
 */

import type { BadgeProps as RadixBadgeProps } from "@radix-ui/themes";
import type { BadgeProps, BadgeTone } from "@speculoos/react";

/** Any Radix accent colour: "green", "red", "iris", … */
export type RadixColor = NonNullable<RadixBadgeProps["color"]>;

/** Must match `HttpMethod` in `@speculoos/core`. Kept local so the map needs no core import. */
export type HttpMethod = "get" | "put" | "post" | "delete" | "patch" | "head" | "options" | "trace";

/** A response status by class. "default" is OpenAPI's catch-all response. */
export type StatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "default";

/** Must match `Direction` in `@speculoos/core`. */
export type Direction = "client-sends" | "server-sends";

export interface BadgeColors {
  method: Record<HttpMethod, RadixColor>;
  status: Record<StatusClass, RadixColor>;
  direction: Record<Direction, RadixColor>;
  /** Everything not coloured by its value. Also the fallback for an unknown value. */
  tone: Record<BadgeTone, RadixColor>;
}

/** Overrides, merged entry by entry over `DEFAULT_COLORS`. */
export interface BadgeColorOverrides {
  method?: Partial<Record<HttpMethod, RadixColor>>;
  status?: Partial<Record<StatusClass, RadixColor>>;
  direction?: Partial<Record<Direction, RadixColor>>;
  tone?: Partial<Record<BadgeTone, RadixColor>>;
}

/**
 * The defaults. Methods follow the convention most API docs share — reads
 * green, creates blue, destructive red — and statuses go by class.
 */
export const DEFAULT_COLORS: BadgeColors = {
  method: {
    get: "green",
    post: "blue",
    put: "orange",
    patch: "amber",
    delete: "red",
    head: "gray",
    options: "gray",
    trace: "gray",
  },
  status: {
    "1xx": "gray",
    "2xx": "green",
    "3xx": "blue",
    "4xx": "orange",
    "5xx": "red",
    default: "gray",
  },
  // Both directions take the WebSocket protocol's colour: they are the two
  // halves of one connection, and the arrow already says which is which.
  direction: {
    "client-sends": "cyan",
    "server-sends": "cyan",
  },
  tone: {
    method: "gray",
    status: "gray",
    direction: "gray",
    constraint: "gray",
    required: "red",
    deprecated: "amber",
    mediaType: "gray",
    protocol: "cyan",
    securityScheme: "gray",
    note: "gray",
  },
};

export function mergeColors(overrides: BadgeColorOverrides | undefined): BadgeColors {
  return {
    method: { ...DEFAULT_COLORS.method, ...overrides?.method },
    status: { ...DEFAULT_COLORS.status, ...overrides?.status },
    direction: { ...DEFAULT_COLORS.direction, ...overrides?.direction },
    tone: { ...DEFAULT_COLORS.tone, ...overrides?.tone },
  };
}

/** "200" → "2xx", "4XX" → "4xx", "default" → "default". */
function statusClass(status: string): StatusClass | undefined {
  if (status === "default") return "default";
  const first = status[0];
  return first !== undefined && "12345".includes(first) ? (`${first}xx` as StatusClass) : undefined;
}

function lookup<K extends string>(table: Record<K, RadixColor>, key: string | undefined): RadixColor | undefined {
  return key !== undefined && Object.hasOwn(table, key) ? table[key as K] : undefined;
}

export function badgeColor(colors: BadgeColors, { tone, value }: Pick<BadgeProps, "tone" | "value">): RadixColor {
  const byValue =
    tone === "method" ? lookup(colors.method, value)
    : tone === "status" ? lookup(colors.status, value === undefined ? undefined : statusClass(value))
    : tone === "direction" ? lookup(colors.direction, value)
    : undefined;
  return byValue ?? colors.tone[tone];
}
