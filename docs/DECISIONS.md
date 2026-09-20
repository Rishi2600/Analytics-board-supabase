# Decisions

Short architecture decision records. Newest last. Each one states the context, the
decision, and what it costs us, so a reviewer can tell a decision from an oversight.

---

## ADR-0001 - No Next.js

**Status:** accepted, 2026-09-20

**Context.** The original brief paired a Next.js frontend with Supabase for everything
server side. Those two statements pull against each other. Next.js brings its own server:
route handlers, server actions, a second place to hold secrets, a second auth surface to
get right, and a second deployment target to keep in sync with the first.

**Decision.** Build the dashboard as a Vite single page application. Anything that must run
on a server runs as a Supabase Edge Function.

**Why this is not a downgrade.** The dashboard sits entirely behind a login, so it has no
SEO requirement and nothing to gain from server rendering. Its first paint is gated on
authentication and on a data round trip either way. What we get in exchange is one backend,
one place secrets can live, one auth model, and a build that deploys as static files.

**Consequences.** We give up server components and streaming SSR. If a public marketing
surface or a shareable public dashboard is ever needed, it is a separate deployment and
this decision gets revisited for that surface alone, not for the app.

---

## ADR-0002 - No Redis

**Status:** accepted, 2026-09-20

**Context.** The brief listed Redis as the cache layer. Redis is a separate service to
provision, secure, monitor and pay for, and at the data volume this project targets it
would be solving a problem we can design away instead.

**Decision.** Replace Redis with three layers Supabase already gives us.

1. **Pre-aggregated rollup tables.** This is the real fix and the other two are minor next
   to it. A query that reads 900 daily rows instead of two million event rows does not need
   a cache in front of it. Caching is what you reach for when the underlying query is too
   expensive; the better move is to make it cheap.
2. **A `query_cache` table in Postgres**, unlogged, with a TTL and a per project cache
   epoch, for expensive ad hoc breakdowns that cannot be pre-aggregated.
3. **TanStack Query on the client**, which removes most repeat traffic before it becomes a
   request at all.

**Consequences.** Cache reads and writes contend with the same Postgres that serves
queries, where Redis would not. An unlogged table loses its contents on an unclean restart,
which is acceptable for a cache and is the reason it is unlogged. The query layer is
written so the cache is reached through one module, so swapping in an external Redis later
is a one file change. The trigger for doing that is recorded in the deferred section of
`docs/ARCHITECTURE.md`.

---

## ADR-0003 - npm workspaces as the package manager

**Status:** accepted, 2026-09-20

**Context.** The repository holds three publishable or buildable units: the dashboard
(`apps/web`), the customer SDK (`packages/sdk`), and operational scripts (`scripts/`). They
share TypeScript config and the generated database types, so they want to live in one
workspace. The shadcn documentation shows `pnpm dlx` in its examples, and pnpm is not
installed on this machine.

**Decision.** Use npm workspaces. npm 11 ships with Node 24 and needs no extra install
step, and workspace support covers everything we need here.

**Consequences.** Slower installs and a larger `node_modules` than pnpm would produce.
Commands in the documentation that show `pnpm dlx` are run as `npx` instead. If install
time becomes annoying, moving to pnpm is a lockfile change and a CI line, not a code
change.

---

## ADR-0004 - Tailwind v4, so the token file is CSS

**Status:** accepted, 2026-09-20

**Context.** The build rules call for exactly one token file with no hex literal anywhere
else in the codebase. That instruction assumes the Tailwind v3 shape, where tokens live in
`tailwind.config.js`. The current release is Tailwind v4.3, which has no JavaScript config
file in the Vite setup. Configuration is CSS first: the framework is pulled in with
`@import "tailwindcss"`, the Vite plugin `@tailwindcss/vite` replaces the PostCSS pipeline,
and design tokens are declared in an `@theme` block.

**Decision.** Follow the current documentation. The single token file is
`apps/web/src/index.css`. Every color, radius and font token is declared there and nowhere
else. The rule survives intact, only the file extension changed.

**Consequences.** Tokens are CSS custom properties rather than a JavaScript object, so they
cannot be imported into TypeScript directly. Where a chart library needs a color value at
runtime, it reads the custom property off the computed style rather than hardcoding a hex,
which keeps the no-hex-outside-the-token-file rule true for chart code as well. This is
logged because it is a mechanical deviation from the build instructions, taken under the
rule that current official documentation wins over the brief on mechanical details.

---

## ADR-0005 - Path alias without baseUrl

**Status:** accepted, 2026-09-20

**Context.** The shadcn/ui Vite installation guide says to add both `baseUrl` and `paths`
to `tsconfig.json` and `tsconfig.app.json`. The installed compiler is TypeScript 6, which
deprecates `baseUrl` and fails the build with TS5101 unless the deprecation is explicitly
silenced.

**Decision.** Declare `paths` only. Since TypeScript 5.0, `paths` entries resolve relative
to the tsconfig file that declares them, so `baseUrl` adds nothing.

**Consequences.** The install docs and this repository differ by one line. The shadcn CLI
validated the alias during init and resolves it from `components.json`, so `shadcn add`
continues to work. Logged because it is a deviation from a documented install step, taken
under the rule that current tooling behaviour wins over an instruction written against an
older version.

---

## ADR-0006 - ESLint and Prettier, not the template's oxlint

**Status:** accepted, 2026-09-20

**Context.** `create-vite` 9 no longer scaffolds ESLint. It ships oxlint, a much faster
Rust linter, with a small default rule set. The build brief specifies ESLint and Prettier.

**Decision.** Remove oxlint and configure ESLint 10 flat config at the repository root,
with `typescript-eslint` type aware rules, the React Hooks and React Refresh plugins, and
Prettier for formatting with `eslint-config-prettier` last so the two never fight.

**Why, beyond following the brief.** This project's worst failure mode is a silent one: a
dropped promise in an ingestion or rollup path, or a floating `supabase.rpc()` call whose
rejection nobody sees. Catching that needs type aware linting, which means the linter has
to read the TypeScript program. `@typescript-eslint/no-floating-promises` is enabled as an
error for exactly this reason. oxlint's type aware mode exists but is newer and covers
fewer rules today.

**Consequences.** Linting is slower than oxlint would be, which at this repository size is
not yet measurable. One linter, configured once at the root, covers `apps/web`,
`packages/sdk` and `scripts`. The Deno Edge Functions under `supabase/functions` are
excluded and get their own configuration in phase 4, because they have a different global
environment and module resolution.

Two rules carry deliberate exceptions, both commented in `eslint.config.js`: config files
written in plain JavaScript have the type aware rules switched off, and the vendored
shadcn primitives under `src/components/ui` are exempt from
`react-refresh/only-export-components`, because several of them export a variants helper
next to the component and editing generated files to satisfy a developer experience rule
is the wrong trade.
