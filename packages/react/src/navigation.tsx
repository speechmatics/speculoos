/**
 * Navigation and type sections.
 *
 * `<TypeSections>` exists because `expandRefs: "never"` is the default: a
 * `$ref` becomes a link, and a link needs something to land on. It renders
 * every entry in `ir.schemas`, not just the reachable ones — deciding what is
 * worth keeping is `@speculoos/transforms`' job, and a renderer that quietly
 * dropped types would make that decision invisible.
 */

import type { ReactNode } from "react";
import type { Endpoint, Operation as IROperation, TypeId } from "@speculoos/core";
import { useComponents, useSpeculoos } from "./context.js";
import { useEndpoints, useTagGroups } from "./hooks.js";
import { DocsBody, SchemaTable } from "./fields.js";
import { DIRECTION_LABEL, DIRECTION_VERB } from "./labels.js";

/**
 * Method, path and title, as inline siblings with a space between each.
 *
 * The spaces are not styling. This label usually sits inside a `Link`, which
 * is inline, so a map's layout cannot separate its parts — without them it
 * reads "GET/jobsList jobs", which is what the Radix Themes map showed.
 */
function OperationLabel({ endpoint, operation }: { endpoint: Endpoint; operation: IROperation }): ReactNode {
  const C = useComponents();
  return (
    <>
      {operation.kind === "request-response" ? (
        <C.Badge tone="method" value={operation.method}>{operation.method.toUpperCase()}</C.Badge>
      ) : (
        <C.Badge tone="direction" value={operation.direction}>{DIRECTION_LABEL[operation.direction]}</C.Badge>
      )}
      {operation.kind === "request-response" && operation.isWebhook && (
        <> <C.Badge tone="note">webhook</C.Badge></>
      )}{" "}
      <C.Code>{endpoint.address}</C.Code>
      {operation.docs.title !== undefined && <> {operation.docs.title}</>}
    </>
  );
}

/**
 * An operation's label under its endpoint in `EndpointList`: the mark and the
 * title, without the address the endpoint already shows. A message operation
 * with no title says what the reader does, "Send" / "Receive".
 */
function NestedOperationLabel({ operation }: { operation: IROperation }): ReactNode {
  const C = useComponents();
  return operation.kind === "request-response" ? (
    <>
      <C.Badge tone="method" value={operation.method}>{operation.method.toUpperCase()}</C.Badge>
      {operation.isWebhook && <> <C.Badge tone="note">webhook</C.Badge></>}
      {operation.docs.title !== undefined && <> {operation.docs.title}</>}
    </>
  ) : (
    <>
      <C.Badge tone="direction" value={operation.direction}>{DIRECTION_LABEL[operation.direction]}</C.Badge>{" "}
      {operation.docs.title ?? DIRECTION_VERB[operation.direction]}
    </>
  );
}

export interface EndpointListProps {
  /** Leave out each endpoint's operations, listing only the addresses. Default false. */
  addressesOnly?: boolean;
}

/**
 * Every endpoint, in document order, each linking to itself and listing its
 * operations beneath. The navigation for a site with a page per endpoint.
 */
export function EndpointList({ addressesOnly = false }: EndpointListProps = {}): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  const endpoints = useEndpoints();

  if (endpoints.length === 0) return <C.Empty>No endpoints</C.Empty>;

  return (
    <C.List kind="endpoints">
      {endpoints.map((endpoint) => {
        const target = { kind: "endpoint" as const, id: endpoint.id, endpoint };
        const href = options.href(target);
        const address = <C.Code>{endpoint.address}</C.Code>;
        return (
          <C.ListItem key={endpoint.id}>
            {href === undefined ? address : <C.Link href={href} target={target}>{address}</C.Link>}
            {!addressesOnly && endpoint.operations.length > 0 && (
              <C.List kind="operations">
                {endpoint.operations.map((operation) => {
                  const opTarget = { kind: "operation" as const, id: operation.id, operation, endpoint };
                  const opHref = options.href(opTarget);
                  const label = <NestedOperationLabel operation={operation} />;
                  return (
                    <C.ListItem key={operation.id}>
                      {opHref === undefined ? label : <C.Link href={opHref} target={opTarget}>{label}</C.Link>}
                    </C.ListItem>
                  );
                })}
              </C.List>
            )}
          </C.ListItem>
        );
      })}
    </C.List>
  );
}

export interface OperationListProps {
  /** Heading level for the tag sections. Defaults to the provider's. */
  level?: number;
}

/** Operations grouped under the document's tags, in declared order. */
export function OperationList({ level }: OperationListProps = {}): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  const groups = useTagGroups();
  const heading = level ?? options.headingLevel;

  if (groups.length === 0) return <C.Empty>No operations</C.Empty>;

  return (
    <>
      {groups.map(({ tag, entries }) => (
        <C.Section
          key={tag.name}
          kind="tag"
          id={options.href({ kind: "tag", name: tag.name, def: tag })?.replace(/^#/, "")}
          title={tag.name}
          level={heading}
        >
          <DocsBody docs={tag.docs} />
          <C.List kind="operations">
            {entries.map(({ endpoint, operation }) => {
              const href = options.href({
                kind: "operation",
                id: operation.id,
                operation,
                endpoint,
              });
              const label = <OperationLabel endpoint={endpoint} operation={operation} />;
              return (
                <C.ListItem key={`${endpoint.id}:${operation.id}`}>
                  {href === undefined ? (
                    label
                  ) : (
                    <C.Link
                      href={href}
                      target={{ kind: "operation", id: operation.id, operation, endpoint }}
                    >
                      {label}
                    </C.Link>
                  )}
                </C.ListItem>
              );
            })}
          </C.List>
        </C.Section>
      ))}
    </>
  );
}

export interface TypeSectionProps {
  typeId: TypeId;
  level?: number;
}

/** One named type, as the thing a `$ref` link lands on. */
export function TypeSection({ typeId, level }: TypeSectionProps): ReactNode {
  const C = useComponents();
  const { ir, options } = useSpeculoos();
  const def = ir.schemas[typeId];
  if (def === undefined) return <C.Empty>{`Unknown type ${typeId}`}</C.Empty>;
  return (
    <C.Section
      kind="type"
      id={def.slug}
      title={def.name}
      level={level ?? options.headingLevel}
      deprecated={def.docs.deprecated === true}
    >
      <DocsBody docs={def.docs} />
      <SchemaTable node={def.node} />
      {def.referencedBy.length > 0 && (
        <C.List kind="tags">
          {def.referencedBy.map((id) => {
            const other = ir.schemas[id];
            const href = options.href({ kind: "type", id, def: other });
            return (
              <C.ListItem key={id}>
                {href === undefined ? (
                  <C.Code>{other?.name ?? id}</C.Code>
                ) : (
                  <C.Link href={href} target={{ kind: "type", id, def: other }}>
                    <C.Code>{other?.name ?? id}</C.Code>
                  </C.Link>
                )}
              </C.ListItem>
            );
          })}
        </C.List>
      )}
    </C.Section>
  );
}

export interface TypeSectionsProps {
  level?: number;
}

/** Every named type, in registry order, so no `$ref` link dangles. */
export function TypeSections({ level }: TypeSectionsProps = {}): ReactNode {
  const { ir } = useSpeculoos();
  return (
    <>
      {Object.keys(ir.schemas).map((id) => (
        <TypeSection key={id} typeId={id} {...(level !== undefined ? { level } : {})} />
      ))}
    </>
  );
}
