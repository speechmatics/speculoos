/**
 * Type-level smoke test: can the IR express a REST endpoint and a WebSocket
 * channel with a 3.x-style reply, side by side, in one document?
 *
 * The assertions are trivial; the value is in `tsc --noEmit` accepting the
 * literal below. If the document layer is missing something, this stops compiling.
 */
import { describe, expect, it } from "vitest";
import type { ApiIR, Endpoint, ObjectNode, StringNode, TypeDef } from "../src/index.js";

const at = (pointer: string) => ({ document: "demo", pointer });

const language: StringNode = {
  kind: "string",
  source: at("#/components/schemas/Language"),
  docs: { description: "ISO 639-1 code.", examples: ["en"] },
  nullable: false,
  constraints: { pattern: "^[a-z]{2}$" },
};

const config: ObjectNode = {
  kind: "object",
  source: at("#/components/schemas/TranscriptionConfig"),
  docs: { title: "TranscriptionConfig" },
  nullable: false,
  properties: [
    {
      name: "language",
      node: { kind: "ref", target: "demo#/components/schemas/Language", source: at("#/x"), docs: {}, nullable: false },
      required: true,
      readOnly: false,
      writeOnly: false,
      deprecated: false,
      docs: { description: "Language of the audio." },
    },
  ],
  additional: { kind: "forbidden" },
  patternProperties: [],
  constraints: {},
  composedFrom: [],
};

const types: Record<string, TypeDef> = {
  "demo#/components/schemas/Language": {
    id: "demo#/components/schemas/Language",
    name: "Language",
    slug: "language",
    node: language,
    docs: {},
    source: at("#/components/schemas/Language"),
    referencedBy: ["demo#/components/schemas/TranscriptionConfig"],
  },
  "demo#/components/schemas/TranscriptionConfig": {
    id: "demo#/components/schemas/TranscriptionConfig",
    name: "TranscriptionConfig",
    slug: "transcription-config",
    node: config,
    docs: {},
    source: at("#/components/schemas/TranscriptionConfig"),
    referencedBy: [],
  },
};

const restPath: Endpoint = {
  id: "/v2/jobs",
  slug: "v2-jobs",
  address: "/v2/jobs",
  addressKind: "path",
  protocols: ["https"],
  docs: {},
  parameters: [],
  servers: ["batch"],
  source: at("#/paths/~1v2~1jobs"),
  operations: [
    {
      kind: "request-response",
      id: "createJob",
      slug: "create-job",
      method: "post",
      docs: { title: "Create a job" },
      tags: ["Jobs"],
      deprecated: false,
      security: [[{ scheme: "bearer", scopes: [] }]],
      parameters: [],
      requestBody: {
        required: true,
        docs: {},
        content: [{ mediaType: "application/json", node: config, view: "request", examples: [] }],
      },
      responses: [{ status: "201", docs: {}, headers: [], content: [] }],
      callbacks: [],
      links: [],
      isWebhook: false,
      source: at("#/paths/~1v2~1jobs/post"),
    },
  ],
};

const wsChannel: Endpoint = {
  id: "realtime",
  slug: "realtime",
  address: "/v2",
  addressKind: "channel",
  protocols: ["wss"],
  docs: {},
  parameters: [],
  servers: ["realtime"],
  source: at("#/channels/realtime"),
  operations: [
    {
      kind: "message",
      id: "startRecognition",
      slug: "start-recognition",
      direction: "client-sends",
      docs: {},
      tags: [],
      deprecated: false,
      security: [],
      source: at("#/operations/startRecognition"),
      messages: [
        {
          id: "demo#/components/messages/StartRecognition",
          name: "StartRecognition",
          docs: {},
          payload: config,
          discriminatorValue: "StartRecognition",
          examples: [],
          source: at("#/components/messages/StartRecognition"),
        },
      ],
      // AsyncAPI 3.x request/reply — the thing that is unrepresentable if
      // operations are folded into channels.
      reply: {
        messages: [
          {
            id: "demo#/components/messages/RecognitionStarted",
            name: "RecognitionStarted",
            docs: {},
            payload: { kind: "any", source: at("#/x"), docs: {}, nullable: false },
            examples: [],
            source: at("#/components/messages/RecognitionStarted"),
          },
        ],
      },
    },
  ],
};

const ir: ApiIR = {
  irVersion: 1,
  info: { title: "Demo", version: "2.0.0" },
  servers: [
    {
      id: "batch",
      url: "https://asr.api.example.com",
      protocol: "https",
      docs: {},
      variables: [],
      security: [],
      source: at("#/servers/batch"),
    },
    {
      id: "realtime",
      url: "wss://eu2.rt.example.com",
      protocol: "wss",
      docs: {},
      variables: [],
      security: [],
      source: at("#/servers/realtime"),
    },
  ],
  securitySchemes: {
    bearer: {
      kind: "http",
      id: "bearer",
      scheme: "bearer",
      bearerFormat: "JWT",
      docs: {},
      source: at("#/components/securitySchemes/bearer"),
    },
  },
  tags: [{ name: "Jobs", docs: {}, source: at("#/tags/0") }],
  endpoints: [restPath, wsChannel],
  security: [],
  schemas: types,
  diagnostics: [],
  provenance: { dialect: "openapi", dialectVersion: "3.1.0", documents: ["demo"] },
};

describe("ApiIR", () => {
  it("holds REST and WebSocket endpoints in one document", () => {
    expect(ir.endpoints.map((e) => e.addressKind)).toEqual(["path", "channel"]);
  });

  it("discriminates operations by kind", () => {
    const kinds = ir.endpoints.flatMap((e) => e.operations.map((o) => o.kind));
    expect(kinds).toEqual(["request-response", "message"]);
  });

  it("narrows a message operation to reach its reply", () => {
    const op = ir.endpoints[1]?.operations[0];
    if (op?.kind !== "message") throw new Error("expected a message operation");
    expect(op.reply?.messages[0]?.name).toBe("RecognitionStarted");
  });
});
