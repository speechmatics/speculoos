/**
 * Navigation and type sections.
 *
 * `<TypeSections>` exists because `expandRefs: "never"` is the default: a
 * `$ref` becomes a link, and a link needs something to land on. It renders
 * every entry in `ir.schemas`, not just the reachable ones — deciding what is
 * worth keeping is `@speculoos/transforms`' job, and a renderer that quietly
 * dropped types would make that decision invisible.
 */

import { Fragment, type ReactNode } from "react";
import { entrySlug } from "@speculoos/core";
import type { ApiEntry, Endpoint, HrefTarget, Operation as IROperation, TypeId } from "@speculoos/core";
import { useComponents, useSpeculoos } from "./context.js";
import { useEntries, useTagGroups } from "./hooks.js";
import { DocsBody, SchemaTable } from "./fields.js";
import { DIRECTION_LABEL } from "./labels.js";

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
 * An entry's sidebar label. A REST operation leads with its method and then
 * its summary, falling back to its path; a channel leads with its protocol —
 * standing where a method would — and then its title, falling back to its
 * address.
 */
function EntryLabel({ entry }: { entry: ApiEntry }): ReactNode {
  const C = useComponents();
  if (entry.kind === "operation") {
    const { endpoint, operation } = entry;
    return (
      <>
        {operation.kind === "request-response" ? (
          <C.Badge tone="method" value={operation.method}>{operation.method.toUpperCase()}</C.Badge>
        ) : (
          <C.Badge tone="direction" value={operation.direction}>{DIRECTION_LABEL[operation.direction]}</C.Badge>
        )}
        {operation.kind === "request-response" && operation.isWebhook && <> <C.Badge tone="note">webhook</C.Badge></>}{" "}
        {operation.docs.title ?? <C.Code>{endpoint.address}</C.Code>}
      </>
    );
  }
  const { endpoint } = entry;
  return (
    <>
      {endpoint.protocols.map((protocol) => (
        <Fragment key={protocol}>
          <C.Badge tone="protocol" value={protocol}>{protocol.toUpperCase()}</C.Badge>{" "}
        </Fragment>
      ))}
      {endpoint.docs.title ?? <C.Code>{endpoint.address}</C.Code>}
    </>
  );
}

/** Where an entry's link points: its operation, or its channel. */
function entryTarget(entry: ApiEntry): HrefTarget {
  return entry.kind === "operation"
    ? { kind: "operation", id: entry.operation.id, operation: entry.operation, endpoint: entry.endpoint }
    : { kind: "endpoint", id: entry.endpoint.id, endpoint: entry.endpoint };
}

/**
 * The API reference's index: one link per REST operation, one per channel, in
 * document order. The sidebar for a site with a page per entry — see
 * `apiEntries` in core for why a channel is one entry and a path is not.
 */
export function EntryList(): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  const entries = useEntries();

  if (entries.length === 0) return <C.Empty>No operations</C.Empty>;

  return (
    <C.List kind="entries">
      {entries.map((entry) => {
        const target = entryTarget(entry);
        const href = options.href(target);
        const label = <EntryLabel entry={entry} />;
        return (
          <C.ListItem key={entrySlug(entry)}>
            {href === undefined ? label : <C.Link href={href} target={target}>{label}</C.Link>}
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
