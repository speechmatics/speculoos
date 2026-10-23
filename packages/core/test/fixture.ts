/**
 * A deliberately awkward IR: recursion, a discriminated union, a map, an array
 * of refs, readOnly/writeOnly behind a ref, and an unsupported node. If the
 * presentation layer survives this, the node set is probably about right.
 */
import type {
  ApiIR,
  Docs,
  EnumNode,
  Node,
  ObjectNode,
  Property,
  StringNode,
  TypeDef,
} from "../src/index.js";

export const loc = (pointer: string) => ({ document: "demo", pointer });

export const str = (
  constraints: StringNode["constraints"] = {},
  docs: Docs = {},
): StringNode => ({ kind: "string", source: loc("#"), docs, nullable: false, constraints });

export const num = (integer = false, constraints = {}, docs: Docs = {}): Node => ({
  kind: "number",
  source: loc("#"),
  docs,
  nullable: false,
  integer,
  constraints,
});

export const bool = (docs: Docs = {}): Node => ({
  kind: "boolean",
  source: loc("#"),
  docs,
  nullable: false,
});

export const ref = (target: string, docs: Docs = {}): Node => ({
  kind: "ref",
  source: loc("#"),
  docs,
  nullable: false,
  target,
});

export const arr = (items: Node, constraints = {}): Node => ({
  kind: "array",
  source: loc("#"),
  docs: {},
  nullable: false,
  items,
  constraints,
});

export const prop = (
  name: string,
  node: Node,
  extra: Partial<Omit<Property, "name" | "node">> = {},
): Property => ({
  name,
  node,
  required: false,
  readOnly: false,
  writeOnly: false,
  deprecated: false,
  docs: {},
  ...extra,
});

export const obj = (
  properties: Property[],
  extra: Partial<Omit<ObjectNode, "kind" | "properties">> = {},
): ObjectNode => ({
  kind: "object",
  source: loc("#"),
  docs: {},
  nullable: false,
  properties,
  additional: { kind: "any" },
  patternProperties: [],
  constraints: {},
  composedFrom: [],
  ...extra,
});

export const enumNode = (values: unknown[], docs: Docs = {}): EnumNode => ({
  kind: "enum",
  source: loc("#"),
  docs,
  nullable: false,
  baseType: "string",
  members: values.map((value) => ({ value })),
});

const def = (name: string, node: Node, docs: Docs = {}): TypeDef => ({
  id: `demo#/components/schemas/${name}`,
  name,
  slug: name.toLowerCase(),
  node,
  docs,
  source: loc(`#/components/schemas/${name}`),
  referencedBy: [],
});

const id = (name: string) => `demo#/components/schemas/${name}`;

// A self-referential type. The classic way to hang a renderer.
const treeNode = obj([
  prop("label", str({ minLength: 1 }), { required: true }),
  prop("children", arr(ref(id("TreeNode"))), {
    docs: { description: "Nested nodes, arbitrarily deep." },
  }),
]);

const language = str(
  { pattern: "^[a-z]{2}$" },
  { description: "An ISO 639-1 language code.", default: "en", examples: ["en", "fr"] },
);

const transcriptionConfig = obj(
  [
    prop("language", ref(id("Language")), {
      required: true,
      // Usage-level docs must beat the type's own description.
      docs: { description: "Language of the audio you are submitting." },
    }),
    prop("operating_point", enumNode(["standard", "enhanced"]), {
      docs: { description: "Accuracy / speed trade-off." },
    }),
    prop("diarization", bool({ default: false })),
    prop("internal_flag", bool(), { writeOnly: true, deprecated: true }),
  ],
  { additional: { kind: "forbidden" }, docs: { title: "TranscriptionConfig" } },
);

const job = obj([
  prop("id", str({ format: "uuid" }), { required: true, readOnly: true }),
  prop("created_at", str({ format: "date-time" }), { required: true, readOnly: true }),
  prop("config", ref(id("TranscriptionConfig")), { required: true }),
  prop("tree", ref(id("TreeNode"))),
  prop("metadata", {
    kind: "map",
    source: loc("#"),
    docs: { description: "Free-form key/value pairs." },
    nullable: false,
    values: str(),
    constraints: {},
  }),
  prop("retry_count", num(true, { minimum: { value: 0, exclusive: false } }), {}),
  prop("conditions", {
    kind: "unsupported",
    source: loc("#"),
    docs: {},
    nullable: false,
    reason: "if/then/else has no display form",
    raw: { if: {}, then: {} },
  }),
]);

// Discriminated union, inferred from a shared const property.
const message: Node = {
  kind: "union",
  source: loc("#"),
  docs: {},
  nullable: false,
  mode: "exactlyOne",
  variants: [
    {
      label: "StartRecognition",
      labelSource: "const",
      discriminatorValue: "StartRecognition",
      node: obj([prop("transcription_config", ref(id("TranscriptionConfig")), { required: true })]),
    },
    {
      label: "AddAudio",
      labelSource: "const",
      discriminatorValue: "AddAudio",
      node: obj([prop("seq_no", num(true), { required: true })]),
    },
  ],
  discriminator: { propertyName: "message", inferred: true },
};

export const schemas: Record<string, TypeDef> = {
  [id("Language")]: def("Language", language, { description: "A supported language." }),
  [id("TranscriptionConfig")]: def("TranscriptionConfig", transcriptionConfig),
  [id("TreeNode")]: def("TreeNode", treeNode, { description: "A node in a tree." }),
  [id("Job")]: def("Job", job),
  [id("Message")]: def("Message", message),
};

export const ir: ApiIR = {
  irVersion: 1,
  info: { title: "Demo", version: "2.0.0" },
  servers: [],
  securitySchemes: {},
  tags: [
    { name: "Jobs", docs: {}, source: loc("#/tags/0") },
    { name: "Realtime", docs: {}, source: loc("#/tags/1") },
  ],
  endpoints: [
    {
      id: "/v2/jobs",
      slug: "v2-jobs",
      address: "/v2/jobs",
      addressKind: "path",
      protocols: ["https"],
      docs: {},
      parameters: [],
      servers: [],
      source: loc("#/paths/~1v2~1jobs"),
      operations: [
        {
          kind: "request-response",
          id: "createJob",
          slug: "create-job",
          method: "post",
          docs: {},
          tags: ["Jobs"],
          deprecated: false,
          security: [],
          parameters: [],
          requestBody: {
            required: true,
            docs: {},
            content: [{ mediaType: "application/json", node: ref(id("Job")), view: "request", examples: [] }],
          },
          responses: [{ status: "201", docs: {}, headers: [], content: [] }],
          callbacks: [],
          links: [],
          isWebhook: false,
          source: loc("#/paths/~1v2~1jobs/post"),
        },
        {
          kind: "request-response",
          id: "listJobs",
          slug: "list-jobs",
          method: "get",
          docs: {},
          tags: [],
          deprecated: false,
          security: [],
          parameters: [],
          responses: [],
          callbacks: [],
          links: [],
          isWebhook: false,
          source: loc("#/paths/~1v2~1jobs/get"),
        },
      ],
    },
    {
      id: "realtime",
      slug: "realtime",
      address: "/v2",
      addressKind: "channel",
      protocols: ["wss"],
      docs: {},
      parameters: [],
      servers: [],
      source: loc("#/channels/realtime"),
      operations: [
        {
          kind: "message",
          id: "sendMessage",
          slug: "send-message",
          direction: "client-sends",
          docs: {},
          tags: ["Realtime"],
          deprecated: false,
          security: [],
          source: loc("#/operations/sendMessage"),
          messages: [
            {
              id: id("Message"),
              name: "Message",
              docs: {},
              payload: ref(id("Message")),
              examples: [],
              source: loc("#/components/messages/Message"),
            },
          ],
        },
      ],
    },
  ],
  security: [],
  schemas,
  diagnostics: [],
  provenance: { dialect: "openapi", dialectVersion: "3.1.0", documents: ["demo"] },
};

export const jobRef = ref(id("Job"));
export const messageRef = ref(id("Message"));
export const treeRef = ref(id("TreeNode"));
export const ids = id;
