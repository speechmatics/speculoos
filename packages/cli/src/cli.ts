#!/usr/bin/env node
/**
 * speculoos — build, lint and inspect API specs as Speculoos IR.
 *
 * This exists before any renderer on purpose: it makes the IR independently
 * useful, gives the project a CI story (`lint`), and `inspect` is by far the
 * fastest debugging loop when working on an adapter.
 */

import { writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { DIAGNOSTIC_CODE_NAMES } from "@speculoos/core";
import { run } from "./run.js";
import { renderInspect, renderLint, summarise } from "./report.js";
import { passesFor } from "./passes.js";

const USAGE = `speculoos — render API specs as a design-system-agnostic IR

Usage:
  speculoos build <spec...> [-o out.json] [--pretty] [transform options]
  speculoos lint  <spec...> [--allow CODE,CODE] [--max-severity info|warning|error]
  speculoos inspect <spec...> [--type <name>] [--operation <id>] [--view request|response]
                              [--expand never|depth|always] [--depth <n>]

Options:
  -o, --out <file>     Where to write IR. Defaults to stdout.
      --pretty         Indent the JSON output.
      --name <name>    Logical document name. Defaults to the file's basename.
      --root <dir>     Project root for resolving refs. Defaults to the spec's directory.
      --allow <codes>  Comma-separated diagnostic codes to ignore when linting.
      --remote         Follow remote $refs. Off by default.
  -h, --help           Show this message.

Transform options (applied in this order, whatever order you pass them in):
      --hide-internal[=key]   Drop anything flagged x-internal (or your own key).
      --tag <names>           Keep only operations carrying one of these tags.
      --keep-untagged         With --tag, also keep operations carrying no tag.
      --sort-tags <names>     Reorder the navigation; unlisted tags follow.
      --rename Old=New,...    Rename named types. Ids and refs are untouched.
      --redact-examples       Empty every examples array in the document.
      --prune                 Drop named types no endpoint can reach.
      --validate              Check the IR after every pass. Slow; worth it in CI.
`;

interface Args {
  command: string;
  specs: string[];
  flags: Map<string, string | true>;
}

export async function main(argv: string[]): Promise<number> {
  const args = parse(argv);

  if (args.flags.has("help") || args.flags.has("h") || args.command === "") {
    process.stdout.write(USAGE);
    return args.command === "" ? 1 : 0;
  }

  if (!["build", "lint", "inspect"].includes(args.command)) {
    process.stderr.write(`Unknown command "${args.command}".\n\n${USAGE}`);
    return 1;
  }

  if (args.specs.length === 0) {
    process.stderr.write(`No spec files given.\n\n${USAGE}`);
    return 1;
  }

  const root = flag(args, "root") ?? dirname(resolve(args.specs[0]!));
  const built = await run({
    specs: args.specs.map((spec) => ({
      name: flag(args, "name") ?? documentName(spec),
      path: resolve(spec),
    })),
    root,
    allowRemoteRefs: args.flags.has("remote"),
    transforms: passesFor({
      ...optional("hideInternal", args.flags.get("hide-internal")),
      ...optional("tag", flag(args, "tag")),
      ...(args.flags.has("keep-untagged") ? { keepUntagged: true } : {}),
      ...optional("sortTags", flag(args, "sort-tags")),
      ...optional("rename", flag(args, "rename")),
      ...(args.flags.has("redact-examples") ? { redactExamples: true } : {}),
      ...(args.flags.has("prune") ? { prune: true } : {}),
    }),
    validate: args.flags.has("validate"),
  });

  if (built.ir === undefined) {
    for (const line of renderLint(built.diagnostics, new Set())) process.stderr.write(line + "\n");
    return 1;
  }

  switch (args.command) {
    case "build": {
      const json = JSON.stringify(built.ir, null, args.flags.has("pretty") ? 2 : 0);
      const out = flag(args, "out") ?? flag(args, "o");
      if (out === undefined) {
        process.stdout.write(json + "\n");
      } else {
        await writeFile(resolve(out), json + "\n");
        process.stderr.write(`${summarise(built.ir)} → ${out}\n`);
      }
      return 0;
    }

    case "lint": {
      const allow = new Set(
        (flag(args, "allow") ?? "").split(",").map((c) => c.trim()).filter(Boolean),
      );
      // A typo in an allow-list silently allows nothing, and the build stays
      // red for a reason nobody can see. Say so rather than letting it rot.
      const unknown = [...allow].filter((c) => !DIAGNOSTIC_CODE_NAMES.includes(c));
      for (const c of unknown) {
        process.stderr.write(`warning: --allow ${c} is not a known diagnostic code\n`);
      }
      const lines = renderLint(built.ir.diagnostics, allow);
      for (const line of lines) process.stdout.write(line + "\n");

      const threshold = flag(args, "max-severity") ?? "warning";
      const offending = built.ir.diagnostics.filter(
        (d) => !allow.has(d.code) && rank(d.severity) >= rank(threshold),
      );
      if (offending.length === 0) {
        process.stdout.write(`${summarise(built.ir)} — no diagnostics at or above ${threshold}.\n`);
        return 0;
      }
      process.stdout.write(`\n${offending.length} diagnostic(s) at or above ${threshold}.\n`);
      return 1;
    }

    case "inspect": {
      const out = renderInspect(built.ir, {
        ...optional("type", flag(args, "type")),
        ...optional("operation", flag(args, "operation")),
        ...optional("view", flag(args, "view")),
        ...optional("expand", flag(args, "expand")),
        ...optional("depth", flag(args, "depth")),
      });
      process.stdout.write(out);
      return 0;
    }
  }

  return 1;
}

/**
 * The logical document name. Derived from the basename, never the full path:
 * it ends up in every TypeId and therefore every URL, and a path would differ
 * between a laptop and CI.
 */
function documentName(spec: string): string {
  return basename(spec, extname(spec));
}

function rank(severity: string): number {
  return severity === "error" ? 3 : severity === "warning" ? 2 : 1;
}

function flag(args: Args, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function parse(argv: string[]): Args {
  const flags = new Map<string, string | true>();
  const specs: string[] = [];
  let command = "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const [name, inline] = splitOnce(arg.slice(2), "=");
      if (inline !== undefined) flags.set(name, inline);
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("-")) flags.set(name, argv[++i]!);
      else flags.set(name, true);
    } else if (arg.startsWith("-") && arg.length > 1) {
      const name = arg.slice(1);
      if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("-")) flags.set(name, argv[++i]!);
      else flags.set(name, true);
    } else if (command === "") {
      command = arg;
    } else {
      specs.push(arg);
    }
  }

  return { command, specs, flags };
}

function splitOnce(value: string, sep: string): [string, string | undefined] {
  const at = value.indexOf(sep);
  return at === -1 ? [value, undefined] : [value.slice(0, at), value.slice(at + 1)];
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
