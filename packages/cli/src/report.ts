/** Human-readable output for `lint` and `inspect`. */

import type { ApiIR, Diagnostic, FieldNode, Node, View } from "@speculoos/core";
import { allOperations, collectLinks, toRows, typeLabel } from "@speculoos/core";

export function summarise(ir: ApiIR): string {
  const operations = allOperations(ir).length;
  const types = Object.keys(ir.schemas).length;
  return `${ir.info.title} ${ir.info.version}: ${ir.endpoints.length} endpoint(s), ${operations} operation(s), ${types} type(s)`;
}

export function renderLint(diagnostics: Diagnostic[], allow: Set<string>): string[] {
  const lines: string[] = [];
  const shown = diagnostics.filter((d) => !allow.has(d.code));

  for (const d of shown) {
    const where = d.source.pointer === "" ? d.source.document : `${d.source.document}#${d.source.pointer}`;
    lines.push(`${d.severity.padEnd(7)} ${d.code.padEnd(24)} ${where}`);
    lines.push(`${" ".repeat(8)}${d.message}`);
  }

  const skipped = diagnostics.length - shown.length;
  if (skipped > 0) lines.push(`(${skipped} allow-listed diagnostic(s) hidden)`);
  return lines;
}

export interface InspectOptions {
  type?: string;
  operation?: string;
  view?: string;
  expand?: string;
  depth?: string;
}

export function renderInspect(ir: ApiIR, opts: InspectOptions): string {
  const view = (["request", "response", "neutral"].includes(opts.view ?? "")
    ? opts.view
    : "neutral") as View;
  const expandRefs = (["never", "depth", "always"].includes(opts.expand ?? "")
    ? opts.expand
    : "depth") as "never" | "depth" | "always";
  const maxDepth = Number(opts.depth ?? "2");
  const options = { view, expandRefs, maxDepth: Number.isFinite(maxDepth) ? maxDepth : 2 };

  const out: string[] = [];

  if (opts.type !== undefined) {
    const def = findType(ir, opts.type);
    if (def === undefined) {
      return `No type matching "${opts.type}".\n\nKnown types:\n${Object.values(ir.schemas)
        .map((d) => `  ${d.name}`)
        .join("\n")}\n`;
    }
    out.push(heading(`${def.name}  (${def.id})`));
    if (def.docs.description !== undefined) out.push(`  ${def.docs.description}\n`);
    out.push(table(def.node, ir, options));
    if (def.referencedBy.length > 0) {
      out.push(`\n  referenced by: ${def.referencedBy.map(shortId).join(", ")}`);
    }
    return `${out.join("\n")}\n`;
  }

  if (opts.operation !== undefined) {
    const entry = allOperations(ir).find((e) => e.operation.id === opts.operation);
    if (entry === undefined) {
      return `No operation "${opts.operation}".\n\nKnown operations:\n${allOperations(ir)
        .map((e) => `  ${e.operation.id}`)
        .join("\n")}\n`;
    }
    const { endpoint, operation } = entry;

    if (operation.kind === "message") {
      const arrow = operation.direction === "client-sends" ? "client →" : "← server";
      out.push(heading(`${arrow} ${endpoint.address}  (${operation.id})`));
      if (operation.docs.description !== undefined) out.push(`  ${operation.docs.description}\n`);

      for (const parameter of endpoint.parameters) {
        out.push(`  ${pad(`${parameter.name}*`, 24)}${pad("in address", 12)}${typeLabel(parameter.node, ir)}`);
      }
      if (endpoint.parameters.length > 0) out.push("");

      for (const message of operation.messages) {
        const label = message.discriminatorValue === undefined ? "" : ` — ${JSON.stringify(message.discriminatorValue)}`;
        out.push(`  Message ${message.name}${label}`);
        out.push(table(message.payload, ir, options));
        out.push("");
      }

      if (operation.reply !== undefined) {
        out.push(`  Reply${operation.reply.channel === undefined ? "" : ` on ${operation.reply.channel}`}`);
        for (const message of operation.reply.messages) {
          out.push(`  Message ${message.name}`);
          out.push(table(message.payload, ir, options));
        }
        out.push("");
      }
      return out.join("\n");
    }

    out.push(heading(`${operation.method.toUpperCase()} ${endpoint.address}  (${operation.id})`));
    if (operation.docs.description !== undefined) out.push(`  ${operation.docs.description}\n`);

    const params = [...endpoint.parameters, ...operation.parameters];
    if (params.length > 0) {
      out.push("  Parameters");
      for (const p of params) {
        out.push(
          `    ${pad(p.name + (p.required ? "*" : ""), 24)}${pad(`in ${p.in}`, 12)}${typeLabel(p.node, ir)}`,
        );
      }
      out.push("");
    }

    if (operation.requestBody !== undefined) {
      for (const variant of operation.requestBody.content) {
        out.push(`  Request body — ${variant.mediaType}`);
        out.push(table(variant.node, ir, { ...options, view: variant.view }));
        out.push("");
      }
    }

    for (const response of operation.responses) {
      out.push(`  Response ${response.status}${response.docs.description === undefined ? "" : ` — ${response.docs.description}`}`);
      for (const variant of response.content) {
        out.push(table(variant.node, ir, { ...options, view: variant.view }));
      }
      out.push("");
    }
    return out.join("\n");
  }

  // No selector: an overview of the document.
  out.push(heading(summarise(ir)));
  for (const { endpoint, operation } of allOperations(ir)) {
    const label =
      operation.kind === "request-response"
        ? `${operation.method.toUpperCase()} ${endpoint.address}`
        : `${operation.direction === "client-sends" ? "→" : "←"} ${endpoint.address}`;
    out.push(`  ${pad(label, 34)}${pad(operation.id, 24)}${operation.tags.join(", ")}`);
  }
  out.push("");
  out.push(heading("Types"));
  for (const def of Object.values(ir.schemas)) {
    out.push(`  ${pad(def.name, 34)}${def.node.kind}`);
  }
  if (ir.diagnostics.length > 0) {
    out.push("");
    out.push(heading(`${ir.diagnostics.length} diagnostic(s)`));
    out.push(...renderLint(ir.diagnostics, new Set()));
  }
  return `${out.join("\n")}\n`;
}

function table(
  node: Node,
  ir: ApiIR,
  options: { view: View; expandRefs: "never" | "depth" | "always"; maxDepth: number },
): string {
  const rows = toRows(node, ir, options);
  const root = rows[0]!;
  const lines: string[] = [];
  // The root row is the thing being described, not a field of it — but its
  // `composedFrom` is the one piece of it a reader needs.
  if (root.composedFrom !== undefined) {
    lines.push(`    extends ${root.composedFrom.map(shortId).join(", ")}`);
  }
  lines.push(...rows.slice(1).map((f) => line(f)));
  const links = collectLinks(root);
  if (links.length > 0) {
    lines.push(`    ${" ".repeat(26)}see also: ${links.map(shortId).join(", ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "    (no fields)";
}

function line(f: FieldNode): string {
  const indent = "  ".repeat(f.depth + 1);
  const name = `${indent}${f.name ?? "·"}${f.required ? "*" : ""}`;
  const tail =
    f.children.kind === "link"
      ? ` → ${shortId(f.children.target)}`
      : f.children.kind === "cycle"
        ? ` ↻ ${shortId(f.children.target)}`
        : f.children.kind === "variants"
          ? ` (${f.children.label})`
          : "";
  return (
    pad(name, 34) +
    pad(f.typeLabel, 26) +
    pad(f.chips.map((c) => c.label).join(", "), 30) +
    (f.docs.description ?? "").split("\n")[0] +
    tail
  );
}

function findType(ir: ApiIR, query: string) {
  const lower = query.toLowerCase();
  return (
    ir.schemas[query] ??
    Object.values(ir.schemas).find((d) => d.name === query) ??
    Object.values(ir.schemas).find((d) => d.name.toLowerCase() === lower) ??
    Object.values(ir.schemas).find((d) => d.slug === lower)
  );
}

function shortId(id: string): string {
  const segments = id.split(/[#/]/).filter(Boolean);
  return segments[segments.length - 1] ?? id;
}

function heading(text: string): string {
  return `\n${text}\n${"─".repeat(Math.min(78, text.length))}`;
}

function pad(text: string, width: number): string {
  const length = [...text].length;
  return length >= width ? `${text} ` : text + " ".repeat(width - length);
}
