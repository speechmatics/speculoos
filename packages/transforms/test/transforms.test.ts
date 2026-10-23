import { beforeAll, describe, expect, it } from "vitest";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { allOperations, type ApiIR, type TypeDef } from "@speculoos/core";
import { parseApiIR } from "@speculoos/core/validate";
import {
  applyTransforms,
  filterByTag,
  hideInternal,
  hideWhere,
  pruneUnreachableTypes,
  reachableTypes,
  redactExamples,
  renameTypes,
  sortTags,
  TransformError,
  type Transform,
} from "../src/index.js";

let base: ApiIR;

beforeAll(async () => {
  const project = await load({ root: specDir, documents: [{ name: "batch", path: "batch.yaml" }] });
  base = buildOpenApi({ project });
});

const ops = (ir: ApiIR) => allOperations(ir).map((e) => e.operation.id);
const typeNames = (ir: ApiIR) => Object.values(ir.schemas).map((d) => d.name).sort();
const id = (name: string) => `batch#/components/schemas/${name}`;

describe("applyTransforms", () => {
  it("applies in order and leaves the input untouched", () => {
    const seen: string[] = [];
    const mark = (name: string): Transform => (ir) => {
      seen.push(name);
      return { ...ir, info: { ...ir.info, title: name } };
    };
    const out = applyTransforms(base, [mark("a"), mark("b")]);
    expect(seen).toEqual(["a", "b"]);
    expect(out.info.title).toBe("b");
    expect(base.info.title).toBe("Batch Transcription");
  });

  it("returns the input unchanged for an empty pipeline", () => {
    expect(applyTransforms(base, [])).toBe(base);
  });

  it("names the transform that produced invalid IR", () => {
    const broken: Transform = (ir) => ({ ...ir, endpoints: "nope" as never });
    const run = () => applyTransforms(base, [sortTags([]), broken], { validate: parseApiIR });
    expect(run).toThrow(TransformError);
    try {
      run();
    } catch (e) {
      const err = e as TransformError;
      expect(err.transform).toContain("broken");
      expect(err.step).toBe(1);
      expect(err.message).toMatch(/step 2/);
      expect(err.message).toMatch(/\/endpoints/);
    }
  });

  it("does not validate unless asked", () => {
    const broken: Transform = (ir) => ({ ...ir, endpoints: "nope" as never });
    expect(() => applyTransforms(base, [broken])).not.toThrow();
  });

  it("keeps the result valid for every built-in", () => {
    const out = applyTransforms(
      base,
      [
        hideInternal(),
        sortTags(["Jobs"]),
        renameTypes({ Job: "Transcription Job" }),
        redactExamples(),
        pruneUnreachableTypes(),
      ],
      { validate: parseApiIR },
    );
    expect(out.irVersion).toBe(1);
  });
});

describe("hideWhere", () => {
  it("drops the operations the predicate selects", () => {
    const out = hideWhere((s) => s.kind === "operation" && s.operation.id === "listJobs")(base);
    expect(ops(out)).not.toContain("listJobs");
    expect(ops(out)).toContain("createJob");
  });

  it("drops an endpoint whose every operation was hidden", () => {
    const addresses = (ir: ApiIR) => ir.endpoints.map((e) => e.address);
    expect(addresses(base)).toContain("/jobs/{id}");
    const out = hideWhere((s) => s.kind === "operation" && s.operation.id === "getJob")(base);
    expect(addresses(out)).not.toContain("/jobs/{id}");
  });

  it("drops a tag that became unused, and keeps one that was already unused", () => {
    expect(base.tags.map((t) => t.name)).toEqual(["Jobs", "Internal"]);
    const out = hideWhere((s) => s.kind === "operation" && s.operation.tags.includes("Jobs"))(base);
    expect(out.tags.map((t) => t.name)).toEqual(["Internal"]);
  });

  it("hides types and recomputes the back-links that pointed at them", () => {
    expect(base.schemas[id("JobStatus")]?.referencedBy).toContain(id("Job"));
    const out = hideWhere((s) => s.kind === "type" && s.type.name === "Job")(base);
    expect(out.schemas[id("Job")]).toBeUndefined();
    expect(out.schemas[id("JobStatus")]?.referencedBy).toEqual([]);
  });

  it("warns when a hidden type is still referenced", () => {
    const out = hideWhere((s) => s.kind === "type" && s.type.name === "JobStatus")(base);
    const codes = out.diagnostics.map((d) => d.code);
    expect(codes).toContain("HIDDEN_TYPE_REFERENCED");
  });

  it("does not warn when the hidden type was unreachable anyway", () => {
    const out = hideWhere((s) => s.kind === "type" && s.type.name === "Unrenderable")(base);
    expect(out.diagnostics.map((d) => d.code)).not.toContain("HIDDEN_TYPE_REFERENCED");
  });

  it("reaches into callbacks", () => {
    const withCallback: ApiIR = {
      ...base,
      endpoints: base.endpoints.map((e) =>
        e.address !== "/jobs" ? e : {
          ...e,
          operations: e.operations.map((o) =>
            o.kind === "request-response" && o.id === "createJob"
              ? { ...o, callbacks: [{ ...base.endpoints[2]! }] }
              : o,
          ),
        },
      ),
    };
    const target = withCallback.endpoints[0]!.operations.find((o) => o.id === "createJob");
    expect(target?.kind === "request-response" && target.callbacks.length).toBe(1);

    const out = hideWhere((s) => s.kind === "operation" && s.operation.id === "jobFinished")(
      withCallback,
    );
    const after = out.endpoints[0]!.operations.find((o) => o.id === "createJob");
    expect(after?.kind === "request-response" && after.callbacks.length).toBe(0);
  });
});

describe("hideInternal", () => {
  it("removes the operation, tag and type carrying the flag", () => {
    const out = hideInternal()(base);
    expect(ops(out)).not.toContain("getJob");
    expect(out.tags.map((t) => t.name)).toEqual(["Jobs"]);
    expect(typeNames(out)).not.toContain("Unrenderable");
  });

  it("takes a different key", () => {
    expect(ops(hideInternal("x-nothing")(base))).toEqual(ops(base));
  });
});

describe("filterByTag", () => {
  it("keeps only operations carrying one of the tags", () => {
    const out = filterByTag(["Jobs"])(base);
    expect(ops(out)).toEqual(["listJobs", "createJob", "getJob"]);
  });

  it("drops untagged operations unless asked to keep them", () => {
    expect(ops(filterByTag(["Jobs"])(base))).not.toContain("jobFinished");
    expect(ops(filterByTag(["Jobs"], { keepUntagged: true })(base))).toContain("jobFinished");
  });

  it("reorders the navigation to match the filter", () => {
    const many: ApiIR = { ...base, tags: [...base.tags].reverse() };
    expect(filterByTag(["Jobs"])(many).tags.map((t) => t.name)).toEqual(["Jobs"]);
  });

  it("leaves an empty document rather than throwing when nothing matches", () => {
    const out = filterByTag(["Nope"])(base);
    expect(out.endpoints).toEqual([]);
    expect(out.tags).toEqual([]);
  });
});

describe("sortTags", () => {
  it("puts unlisted tags after the listed ones by default", () => {
    const out = sortTags(["Internal"])(base);
    expect(out.tags.map((t) => t.name)).toEqual(["Internal", "Jobs"]);
  });

  it("can put them before, or drop them", () => {
    expect(sortTags(["Internal"], { unlisted: "before" })(base).tags.map((t) => t.name)).toEqual([
      "Jobs",
      "Internal",
    ]);
    expect(sortTags(["Internal"], { unlisted: "drop" })(base).tags.map((t) => t.name)).toEqual([
      "Internal",
    ]);
  });

  it("names a tag that does not exist without inventing it", () => {
    expect(sortTags(["Ghost", "Internal"])(base).tags.map((t) => t.name)).toEqual([
      "Internal",
      "Jobs",
    ]);
  });

  it("leaves operations alone", () => {
    expect(ops(sortTags(["Internal"])(base))).toEqual(ops(base));
  });
});

describe("renameTypes", () => {
  it("renames by display name and reslugs", () => {
    const out = renameTypes({ TranscriptionConfig: "Transcription options" })(base);
    const def = out.schemas[id("TranscriptionConfig")] as TypeDef;
    expect(def.name).toBe("Transcription options");
    expect(def.slug).toBe("transcription-options");
  });

  it("renames by id, which wins over a name match", () => {
    const out = renameTypes({ [id("Job")]: "ById", Job: "ByName" })(base);
    expect(out.schemas[id("Job")]?.name).toBe("ById");
  });

  it("keeps the id, so every reference still resolves", () => {
    const out = renameTypes({ Job: "Transcription" })(base);
    expect(Object.keys(out.schemas)).toEqual(Object.keys(base.schemas));
    expect(reachableTypes(out)).toEqual(reachableTypes(base));
  });

  it("leaves untouched types on the slug they already had", () => {
    const out = renameTypes({ Job: "Transcription" })(base);
    for (const [key, def] of Object.entries(base.schemas)) {
      if (key === id("Job")) continue;
      expect(out.schemas[key]?.slug).toBe(def.slug);
    }
  });

  it("breaks a collision with an existing slug rather than duplicating it", () => {
    const out = renameTypes({ TranscriptionConfig: "Job" })(base);
    expect(out.schemas[id("Job")]?.slug).toBe("job");
    expect(out.schemas[id("TranscriptionConfig")]?.slug).toBe("job-2");
  });

  it("is a no-op when nothing matches", () => {
    expect(renameTypes({ Nope: "Other" })(base)).toBe(base);
  });
});

describe("redactExamples", () => {
  it("empties examples wherever they appear, and keeps defaults", () => {
    const withExamples: ApiIR = {
      ...base,
      schemas: {
        ...base.schemas,
        [id("JobStatus")]: {
          ...(base.schemas[id("JobStatus")] as TypeDef),
          docs: { examples: ["running"], default: "running" },
        },
      },
    };
    const out = redactExamples()(withExamples);
    const def = out.schemas[id("JobStatus")] as TypeDef;
    expect(def.docs.examples).toEqual([]);
    expect(def.docs.default).toBe("running");
  });

  it("reaches the pass-through bags too", () => {
    const withBindings: ApiIR = {
      ...base,
      endpoints: base.endpoints.map((e, i) =>
        i === 0 ? { ...e, bindings: { ws: { examples: ["secret"] } } } : e,
      ),
    };
    const out = redactExamples()(withBindings);
    const ws = out.endpoints[0]?.bindings?.["ws"] as { examples: unknown[] };
    expect(ws.examples).toEqual([]);
  });

  it("does not disturb the rest of the document", () => {
    const out = redactExamples()(base);
    expect(ops(out)).toEqual(ops(base));
    expect(typeNames(out)).toEqual(typeNames(base));
  });
});

describe("pruneUnreachableTypes", () => {
  it("drops a type no endpoint can reach", () => {
    expect(typeNames(base)).toContain("Unrenderable");
    expect(typeNames(pruneUnreachableTypes()(base))).not.toContain("Unrenderable");
  });

  it("keeps types reached only through another type", () => {
    // Job -> TranscriptionConfig -> BaseConfig; only Job is named by an operation.
    expect(typeNames(pruneUnreachableTypes()(base))).toContain("BaseConfig");
  });

  it("keeps a self-referential type without looping", () => {
    expect(typeNames(pruneUnreachableTypes()(base))).toContain("Job");
  });

  it("is a no-op when everything is reachable", () => {
    const once = pruneUnreachableTypes()(base);
    expect(pruneUnreachableTypes()(once)).toBe(once);
  });

  it("is what makes filterByTag honest", () => {
    const narrowed = applyTransforms(base, [filterByTag(["Nope"]), pruneUnreachableTypes()]);
    expect(Object.keys(narrowed.schemas)).toEqual([]);
  });
});
