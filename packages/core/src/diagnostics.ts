/**
 * The diagnostic code catalogue.
 *
 * Codes are a public contract, not log text: `speculoos lint --allow NOT,IF`
 * puts them in CI configuration, where a rename is a breaking change for
 * someone. They were a contract before anyone wrote them down, which is the
 * worst kind — so here they are, as data rather than as prose, and a test
 * asserts that nothing is emitted which is not in this table.
 *
 * Severities are what the emitting package actually reports, not a
 * recommendation. `speculoos lint --max-severity` reads the same scale.
 */

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticCode {
  code: string;
  severity: DiagnosticSeverity;
  /** The package that emits it. */
  source: string;
  /** What it means, and what to do about it. */
  meaning: string;
}

/**
 * Codes generated from a keyword rather than written out: `lower` turns an
 * unsupported JSON Schema keyword into SCREAMING_SNAKE_CASE, so `if` becomes
 * `IF` and `$dynamicRef` becomes `DYNAMIC_REF`. All of them mean the same
 * thing — the keyword constrains validation in a way that has no display form,
 * so the node is rendered as `unsupported` with the reason attached.
 */
export const UNSUPPORTED_KEYWORD_CODES: readonly string[] = [
  "DEPENDENT_SCHEMAS",
  "DYNAMIC_REF",
  "IF",
  "NOT",
  "UNEVALUATED_ITEMS",
  "UNEVALUATED_PROPERTIES",
];

export const DIAGNOSTIC_CODES: readonly DiagnosticCode[] = [
  // ── loader ──────────────────────────────────────────────────────────────
  {
    code: "BAD_DOCUMENT_NAME",
    severity: "error",
    source: "@speculoos/loader",
    meaning:
      "A document name is unusable. Names end up in every TypeId and therefore in every URL, so they must be stable and caller-supplied rather than derived from a filesystem path.",
  },
  {
    code: "DOCUMENT_EMPTY",
    severity: "error",
    source: "@speculoos/loader",
    meaning: "The file parsed to nothing. Usually an empty file or one that is all comments.",
  },
  {
    code: "DOCUMENT_UNREADABLE",
    severity: "error",
    source: "@speculoos/loader",
    meaning: "The file could not be read. Check the path and permissions.",
  },
  {
    code: "PARSE_ERROR",
    severity: "error",
    source: "@speculoos/loader",
    meaning: "The file is not valid YAML or JSON.",
  },
  {
    code: "NO_BASE_PATH",
    severity: "error",
    source: "@speculoos/loader",
    meaning: "A relative $ref was found with no base path to resolve it against.",
  },
  {
    code: "REMOTE_REF_DISABLED",
    severity: "error",
    source: "@speculoos/loader",
    meaning:
      "A $ref points at a URL and remote loading is off, which is the default. Fetching whatever a spec names at build time is a supply-chain decision, so it is opt-in rather than automatic.",
  },
  {
    code: "REMOTE_REF_UNSUPPORTED",
    severity: "error",
    source: "@speculoos/loader",
    meaning: "A $ref points at a URL and remote loading is not implemented. Vendor the document instead.",
  },
  {
    code: "NO_DIALECT",
    severity: "info",
    source: "@speculoos/loader",
    meaning: "A document declares no $schema. The default dialect is assumed; say so explicitly if that is wrong.",
  },

  // ── jsonschema ──────────────────────────────────────────────────────────
  {
    code: "INVALID_SCHEMA",
    severity: "error",
    source: "@speculoos/jsonschema",
    meaning: "A schema position holds something that is neither an object nor a boolean.",
  },
  {
    code: "UNRESOLVED_REF",
    severity: "error",
    source: "@speculoos/jsonschema",
    meaning:
      "A $ref names something that is not in the project. The field still renders, marked as an unresolved reference, rather than vanishing.",
  },
  {
    code: "ALLOF_CONFLICT",
    severity: "warning",
    source: "@speculoos/jsonschema",
    meaning:
      "Two allOf branches cannot be merged — most often a union intersected with a scalar. The first member is kept. Nothing is guessed, which is why this is a diagnostic and not a silent choice.",
  },
  {
    code: "ALLOF_UNMERGED",
    severity: "info",
    source: "@speculoos/jsonschema",
    meaning: "An allOf branch was kept as an intersection rather than flattened into its siblings.",
  },
  {
    code: "UNION_WITH_SIBLINGS",
    severity: "info",
    source: "@speculoos/jsonschema",
    meaning:
      "oneOf or anyOf sits alongside other keywords. Both apply, so the result is an intersection of the union with its siblings. The common required-only-branches idiom folds into a note instead.",
  },
  ...UNSUPPORTED_KEYWORD_CODES.map((code) => ({
    code,
    severity: "warning" as const,
    source: "@speculoos/jsonschema",
    meaning:
      "The keyword constrains validation in a way that has no display form. The node renders as `unsupported` with the reason attached, and whatever else the schema said still renders.",
  })),

  // ── adapter-kit ─────────────────────────────────────────────────────────
  {
    code: "REF_CYCLE",
    severity: "error",
    source: "@speculoos/adapter-kit",
    meaning:
      "A $ref chain closes on itself with nothing in between. A self-referential *type* is fine; this is a ref pointing at a ref pointing back.",
  },

  // ── asyncapi ────────────────────────────────────────────────────────────
  {
    code: "UNKNOWN_ACTION",
    severity: "error",
    source: "@speculoos/asyncapi",
    meaning: 'An AsyncAPI 3.x operation declares an action other than "send" or "receive".',
  },
  {
    code: "UNRESOLVED_CHANNEL",
    severity: "error",
    source: "@speculoos/asyncapi",
    meaning: "An operation names a channel that the document does not define.",
  },
  {
    code: "SCHEMA_FORMAT_UNSUPPORTED",
    severity: "warning",
    source: "@speculoos/asyncapi",
    meaning:
      "A message declares a schemaFormat that is not JSON Schema — Avro, Protobuf, OpenAPI-flavoured. The message still appears; its payload shape does not.",
  },

  // ── transforms ──────────────────────────────────────────────────────────
  {
    code: "HIDDEN_TYPE_REFERENCED",
    severity: "warning",
    source: "@speculoos/transforms",
    meaning:
      "A type was hidden but something still links to it, so a renderer will show a broken link. Usually means the predicate was too narrow.",
  },

  // ── cli ─────────────────────────────────────────────────────────────────
  {
    code: "UNKNOWN_DIALECT",
    severity: "error",
    source: "@speculoos/cli",
    meaning:
      "A document declares neither `openapi` nor `asyncapi`. Swagger 2.0 is recognised and refused by name — convert it first.",
  },
];

/** Just the codes, sorted. Useful for validating an `--allow` list. */
export const DIAGNOSTIC_CODE_NAMES: readonly string[] = DIAGNOSTIC_CODES.map((d) => d.code).sort();

/** Looks a code up in the catalogue. */
export function describeDiagnostic(code: string): DiagnosticCode | undefined {
  return DIAGNOSTIC_CODES.find((d) => d.code === code);
}
