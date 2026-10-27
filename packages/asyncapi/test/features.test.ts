import { describe, expect, it } from "vitest";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { toRows, type ApiIR, type MessageOperation } from "@speculoos/core";
import { buildAsyncApi, directionFromV2, directionFromV3, isJsonSchemaFormat } from "../src/index.js";

const root = specDir;

async function build(file: string, name = "doc"): Promise<ApiIR> {
  const project = await load({ root, documents: [{ name, path: file }] });
  return buildAsyncApi({ project });
}

const messageOps = (ir: ApiIR): MessageOperation[] =>
  ir.endpoints.flatMap((e) => e.operations.filter((o): o is MessageOperation => o.kind === "message"));

describe("direction mapping", () => {
  // The 2.x names are written from the application's point of view, which is
  // the inverse of the reader's. Official migration: publish → receive,
  // subscribe → send.
  it("maps the four spellings onto two directions", () => {
    expect(directionFromV2("publish")).toBe("client-sends");
    expect(directionFromV2("subscribe")).toBe("server-sends");
    expect(directionFromV3("receive")).toBe("client-sends");
    expect(directionFromV3("send")).toBe("server-sends");
  });

  it("agrees between the 2.x spelling and its 3.x equivalent", () => {
    expect(directionFromV2("publish")).toBe(directionFromV3("receive"));
    expect(directionFromV2("subscribe")).toBe(directionFromV3("send"));
  });

  it("refuses an unknown action rather than guessing", () => {
    expect(directionFromV3("shout")).toBeUndefined();
  });
});

describe("AsyncAPI 3.x request/reply", () => {
  it("keeps the reply, which folding operations into channels would lose", async () => {
    const ir = await build("reply-v3.yaml");
    const ping = messageOps(ir).find((o) => o.id === "ping");
    expect(ping?.direction).toBe("server-sends");
    expect(ping?.reply?.channel).toBe("pong");
    expect(ping?.reply?.messages.map((m) => m.name)).toEqual(["Pong"]);
  });

  it("reports an unknown action and drops that operation", async () => {
    const ir = await build("reply-v3.yaml");
    expect(ir.diagnostics.map((d) => d.code)).toContain("UNKNOWN_ACTION");
    expect(messageOps(ir).map((o) => o.id)).toEqual(["ping"]);
  });

  it("gives a channel with no operations an empty list, not a missing endpoint", async () => {
    const ir = await build("reply-v3.yaml");
    const pong = ir.endpoints.find((e) => e.id === "pong");
    expect(pong).toBeDefined();
    expect(pong?.operations).toEqual([]);
  });
});

describe("schemaFormat", () => {
  it("recognises the JSON-Schema-shaped formats", () => {
    expect(isJsonSchemaFormat(undefined)).toBe(true);
    expect(isJsonSchemaFormat("application/vnd.aai.asyncapi;version=2.6.0")).toBe(true);
    expect(isJsonSchemaFormat("application/vnd.aai.asyncapi+json;version=3.0.0")).toBe(true);
    expect(isJsonSchemaFormat("application/schema+json;version=draft-07")).toBe(true);
    expect(isJsonSchemaFormat("application/vnd.apache.avro;version=1.9.0")).toBe(false);
    expect(isJsonSchemaFormat("application/vnd.google.protobuf;version=3")).toBe(false);
  });

  it("turns an Avro payload into an unsupported node plus a diagnostic, not a crash", async () => {
    const ir = await build("avro-v3.yaml");
    const messages = messageOps(ir).flatMap((o) => o.messages);

    const legacy = messages.find((m) => m.name === "Legacy");
    expect(legacy?.payload.kind).toBe("unsupported");
    if (legacy?.payload.kind !== "unsupported") throw new Error("expected unsupported");
    expect(legacy.payload.reason).toMatch(/is not JSON Schema/);
    // The raw schema survives, so a renderer can still show it verbatim.
    expect(legacy.payload.raw).toMatchObject({ type: "record" });

    expect(ir.diagnostics.filter((d) => d.code === "SCHEMA_FORMAT_UNSUPPORTED")).toHaveLength(2);
  });

  it("handles the 2.x message-level and 3.x payload-level spellings alike", async () => {
    const ir = await build("avro-v3.yaml");
    const messages = messageOps(ir).flatMap((o) => o.messages);
    expect(messages.find((m) => m.name === "Modern")?.payload.kind).toBe("unsupported");
  });

  it("unwraps a Multi Format Schema Object when the format is understood", async () => {
    const ir = await build("avro-v3.yaml");
    const fine = messageOps(ir)
      .flatMap((o) => o.messages)
      .find((m) => m.name === "Fine");
    expect(fine?.payload.kind).toBe("object");
    const rows = toRows(fine!.payload, { schemas: {} });
    expect(rows.map((r) => r.name)).toContain("ok");
  });
});

describe("the presentation layer works on AsyncAPI IR unchanged", () => {
  it("renders a message payload with the same toRows every REST page uses", async () => {
    const ir = await build("realtime-v2.yaml", "rt");
    const start = messageOps(ir)
      .flatMap((o) => o.messages)
      .find((m) => m.name === "StartRecognition")!;

    const rows = toRows(start.payload, ir, { expandRefs: "always" });
    expect(rows.map((r) => r.name)).toEqual([
      undefined,
      "message",
      "transcription_config",
      "language",
      "operating_point",
      // operating_point is a oneOf of documented consts: a row per value.
      undefined,
      undefined,
    ]);
    expect(rows.find((r) => r.name === "message")?.typeLabel).toBe('"StartRecognition"');
    expect(rows.find((r) => r.name === "operating_point")?.typeLabel).toBe(
      '"standard" | "enhanced"',
    );
    expect(rows.slice(-2).map((r) => r.typeLabel)).toEqual(['"standard"', '"enhanced"']);
  });
});
