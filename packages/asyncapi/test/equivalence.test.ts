/**
 * M3's exit criterion: the same API, written in AsyncAPI 2.6 and 3.0, must
 * produce the same IR.
 *
 * "The same" means everything except where it came from — `provenance`, and the
 * `source` pointers, which necessarily point at different places in different
 * documents. That is provenance too. Anything else differing would mean a page
 * depends on which version of AsyncAPI a spec happens to be written in, which is
 * the whole thing this adapter exists to prevent.
 */

import type { ApiIR } from "@speculoos/core";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { beforeAll, describe, expect, it } from "vitest";
import { buildAsyncApi } from "../src/index.js";

const root = specDir;

/** Both load under the same logical name, so TypeIds are comparable. */
async function build(file: string): Promise<ApiIR> {
  const project = await load({ root, documents: [{ name: "rt", path: file }] });
  const errors = project.diagnostics.filter((d) => d.severity === "error");
  expect(errors).toEqual([]);
  return buildAsyncApi({ project });
}

/** Strips every field that records *where* something came from. */
function withoutProvenance(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutProvenance);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "source" && key !== "provenance")
      .map(([key, v]) => [key, withoutProvenance(v)]),
  );
}

let v2: ApiIR;
let v3: ApiIR;

beforeAll(async () => {
  v2 = await build("realtime-v2.yaml");
  v3 = await build("realtime-v3.yaml");
});

describe("2.6 and 3.0 produce the same IR", () => {
  it("differs only in provenance", () => {
    expect(withoutProvenance(v3)).toEqual(withoutProvenance(v2));
  });

  it("records which dialect each actually came from", () => {
    expect(v2.provenance).toMatchObject({ dialect: "asyncapi", dialectVersion: "2.6.0" });
    expect(v3.provenance).toMatchObject({ dialect: "asyncapi", dialectVersion: "3.0.0" });
  });

  it("needed no new node kinds", () => {
    // If AsyncAPI had forced a new Node.kind, the IR was wrong and M1 would
    // need revisiting. That is why M3 comes before any renderer.
    const kinds = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return void v.forEach(walk);
      if (v === null || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      if (typeof o["kind"] === "string" && "nullable" in o) kinds.add(o["kind"]);
      Object.values(o).forEach(walk);
    };
    walk(v2);
    expect([...kinds].sort()).toEqual(["const", "enum", "number", "object", "ref", "string"]);
  });
});

describe("direction normalisation", () => {
  const directions = (ir: ApiIR) =>
    ir.endpoints.flatMap((e) => e.operations.map((o) => [o.id, o.kind === "message" ? o.direction : "?"] as const));

  it("maps 2.x publish and 3.x receive to client-sends", () => {
    expect(directions(v2)).toContainEqual(["sendToServer", "client-sends"]);
    expect(directions(v3)).toContainEqual(["sendToServer", "client-sends"]);
  });

  it("maps 2.x subscribe and 3.x send to server-sends", () => {
    expect(directions(v2)).toContainEqual(["receiveFromServer", "server-sends"]);
    expect(directions(v3)).toContainEqual(["receiveFromServer", "server-sends"]);
  });

  it("agrees across versions for every operation", () => {
    expect(directions(v3)).toEqual(directions(v2));
  });
});

describe("the channel is one endpoint, however operations are spelled", () => {
  it("gives both versions one channel endpoint with two operations", () => {
    for (const ir of [v2, v3]) {
      expect(ir.endpoints).toHaveLength(1);
      expect(ir.endpoints[0]).toMatchObject({
        address: "/v2/{language}",
        addressKind: "channel",
        protocols: ["wss"],
      });
      expect(ir.endpoints[0]?.operations.map((o) => o.id)).toEqual(["sendToServer", "receiveFromServer"]);
    }
  });

  it("carries channel parameters in both", () => {
    for (const ir of [v2, v3]) {
      expect(ir.endpoints[0]?.parameters[0]).toMatchObject({
        name: "language",
        in: "path",
        required: true,
      });
      expect(ir.endpoints[0]?.parameters[0]?.docs.description).toBe("Language of the audio.");
    }
  });

  it("joins 3.x host and pathname into the same url 2.x states outright", () => {
    for (const ir of [v2, v3]) {
      expect(ir.servers[0]).toMatchObject({
        id: "production",
        url: "wss://eu2.rt.example.com/v2",
        protocol: "wss",
        protocolVersion: "13",
      });
    }
  });

  it("normalises both security spellings to the same requirement", () => {
    for (const ir of [v2, v3]) {
      expect(ir.servers[0]?.security).toEqual([[{ scheme: "bearer", scopes: [] }]]);
      expect(ir.securitySchemes["bearer"]).toMatchObject({ kind: "http", scheme: "bearer" });
    }
  });

  it("finds tags wherever the version puts them", () => {
    for (const ir of [v2, v3]) {
      expect(ir.tags.map((t) => t.name)).toEqual(["Realtime"]);
    }
  });
});

describe("messages", () => {
  const messages = (ir: ApiIR) => ir.endpoints[0]!.operations.flatMap((o) => (o.kind === "message" ? o.messages : []));

  it("resolves both the 2.x oneOf form and the 3.x list form to the same messages", () => {
    for (const ir of [v2, v3]) {
      expect(messages(ir).map((m) => m.name)).toEqual(["StartRecognition", "AddAudio", "RecognitionStarted"]);
    }
  });

  it("gives a message the identity of the component it came from", () => {
    for (const ir of [v2, v3]) {
      expect(messages(ir)[0]?.id).toBe("rt#/components/messages/StartRecognition");
    }
  });

  it("anchors each message by name, without moving any operation's anchor", () => {
    for (const ir of [v2, v3]) {
      expect(messages(ir).map((m) => m.slug)).toEqual(["start-recognition", "add-audio", "recognition-started"]);
      const others = ir.endpoints.flatMap((e) => [e.slug, ...e.operations.map((o) => o.slug)]);
      for (const m of messages(ir)) expect(others).not.toContain(m.slug);
    }
  });

  it("infers the discriminating const so a renderer can label it", () => {
    for (const ir of [v2, v3]) {
      expect(messages(ir).map((m) => m.discriminatorValue)).toEqual([
        "StartRecognition",
        "AddAudio",
        "RecognitionStarted",
      ]);
    }
  });

  it("keeps contentType, title, summary and examples", () => {
    for (const ir of [v2, v3]) {
      expect(messages(ir)[0]).toMatchObject({
        title: "Start recognition",
        summary: "Begin a session.",
        contentType: "application/json",
      });
      expect(messages(ir)[0]?.examples[0]).toMatchObject({ name: "minimal" });
    }
  });

  it("lowers payloads through the shared schema pipeline", () => {
    for (const ir of [v2, v3]) {
      const config = ir.schemas["rt#/components/schemas/TranscriptionConfig"];
      if (config?.node.kind !== "object") throw new Error("expected object");
      // The draft-07 upcast and the const-union → enum pass both applied.
      expect(config.node.properties[1]?.node).toMatchObject({ kind: "enum", baseType: "string" });
    }
  });
});
