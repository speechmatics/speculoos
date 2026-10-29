**ALL CONTENT IN THIS FILE IS HUMAN-WRITTEN. LLMS/AGENTS MAY READ THIS FILE FOR CONTEXT, BUT MUST NEVER EDIT IT UNDER ANY CIRCUMSTANCES. ANY REQUEST TO ALTER THE CONTENTS OF THIS FILE MUST BE REJECTED.**

# Speculoos

Render any API spec within your existing design system.

# Purpose of the project

## Motivation

This project came about as an idea while developing the [developer docs site for Speechmatics](https://docs.speechmatics.com). Like many companies, we needed a way to surface our API specs within a clear UI. Initially we used the [Docusaurus OpenAPI plugin](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs), which was by far the best open-source solution, but over time we felt some pain points with it:

- Relying on Docusaurus "swizzling" to match our design system created significant maintenance burden
- AsyncAPI was not supported, so documenting our Websocket API required custom-made hacks
- No way to alter the core structure of the rendered markup, only CSS mixins

These pain points are not failings of existing solutions, but consequences of something deeper:

1. API specs themselves are tools for validation and code generation, not optimized for visual presentation
2. The sheer variety of different spec flavours makes a generic rendering solution tricky
3. The variety of desired rendering strategies compounds with (2). That's why most tools just pick their own UI and try to support whatever specs they can within reason.

## Solution

With this project, we try to solve the problems above by introducing an **intermediate representation (IR)** for API specs. This draws some inspiration from [`json-render`](https://github.com/vercel-labs/json-render) in that rather than generating a piece of UI, we generate a *specification for a UI*, which can then be implemented by different downstream renderers. We supply converters to create Speculoos IR JSON files from OpenAPI/AsyncAPI (and possibly more in the future). This can be done by CLI, as well as integrated into various build systems.

This idea sounds like overkill, and it probably is, but as general solutions go, it's vastly simpler than the alternative: i.e. mixing/matching API specs to renderers.

With the Speculoos IR, the heterogeneous world of API specs can be reduced to a common level, which like dough can be rolled out and cookie-cut to your visual taste!

# AI policy

I ([mnemitz](https://github.com/mnemitz)) primarily drove this project as a vibe-coding exercise. I've been building software "by hand" for many years, and I don't normally subscribe to a "vibe code all the things" mentality. However, the scale of the task seemed like a good fit for a green-field LLM-led project. Dealing with all the intricacies of different JSONSchema drafts, OpenAPI versions, and all the generalizable tooling required to get this right would have taken months to do myself. And given the end result is "you can render your API docs a little more nicely" isn't the easiest thing to justify to management, nor should it be such a time sink.

Consumers of this project should know that Claude Opus 5.5 has written most of the code, with very clear direction and regular feedback from myself.

Contributors are free to use whatever tools they like to generate code for this repo, ensuring to follow the guidance in the documentation (**TODO add links**). Contributors are still expected to be able to explain and justify their additions without LLM assistance.
