# @speculoos/cli

Build, lint and inspect API specs as Speculoos IR, from the command line.

```sh
npx @speculoos/cli build openapi.yaml -o ir.json --pretty
npx @speculoos/cli lint asyncapi.yaml --allow NOT,IF
npx @speculoos/cli inspect openapi.yaml --operation createJob --expand always
```

- **`build`** writes the IR as JSON, for a docs build to read. It picks the
  adapter from the document's dialect (OpenAPI 3.0/3.1, AsyncAPI 2.x/3.x).
- **`lint`** reports the diagnostics a build would carry
  ([`docs/DIAGNOSTICS.md`](../../docs/DIAGNOSTICS.md)) and fails above a
  severity, so a spec that has stopped rendering cleanly fails CI.
- **`inspect`** prints a type or an operation as the field rows a renderer
  would show, to see what a page will contain without building the site.

`build` applies `@speculoos/transforms` passes from flags, in a fixed order:
`--hide-internal`, `--tag`, `--sort-tags`, `--rename`, `--redact-examples`,
`--prune`. `speculoos --help` lists every option.
