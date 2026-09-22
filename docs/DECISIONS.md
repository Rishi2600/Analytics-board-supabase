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

---

## ADR-0007 - Policy helpers live in an authz schema, not in auth

**Status:** accepted, 2026-09-20

**Context.** The data model called for `auth.current_user_org_ids()`, a security definer
helper that every row level security policy calls instead of running a membership subquery
per row. Creating it failed: `permission denied for schema auth`. Supabase owns that schema
and the migration role has no CREATE on it. This is not a local quirk, it is how hosted
projects are configured, so working around it locally would only move the failure to
deployment.

**Decision.** Put the helpers in a dedicated `authz` schema: `current_user_org_ids`,
`has_org_role`, `can_read_project`, `can_write_project`.

**Consequences.** The policies read `authz.` rather than `auth.`, which is a cosmetic loss
and an isolation gain. `authz` is deliberately absent from the PostgREST exposed schema
list in `supabase/config.toml`, so no client can call these functions directly even though
policies evaluate them on the client's behalf. `authenticated` holds EXECUTE on them
because a policy is evaluated as the querying role, and that grant is the minimum that
makes the policies work. There is a test asserting the schema is unreachable over REST.

The same config change exposes `api`, which is intended: that schema is the dashboard's
read surface. `jobs` is exposed to nobody.

---

## ADR-0008 - React Router in declarative mode

**Status:** accepted, 2026-09-20

**Context.** The brief allowed either TanStack Router or React Router. React Router also
offers a data router with loaders and actions.

**Decision.** React Router, declarative mode: `BrowserRouter` with `Routes` and `Route`.
No loaders, no actions.

**Why.** TanStack Query owns all server state in this project. A router loader that also
fetches creates a second cache with its own staleness rules, and the two disagree: the
loader refetches on navigation while the query cache considers the data fresh, or the
reverse. One owner of server state is worth more here than typed route params, especially
since this app has one dynamic segment, `:projectId`.

**Consequences.** Route parameters are typed by hand through `useParams<{ projectId: string }>()`
rather than inferred. Data fetching starts on render rather than on navigation, which costs
a frame on a cold route and is not measurable against a network round trip. If route level
code splitting becomes necessary, `React.lazy` covers it without changing this decision.

---

## ADR-0009 - Funnels and retention read events_raw

**Status:** accepted, 2026-09-21

**Context.** The build rules say dashboard screens must not query `events_raw`, and that
`api.live_events` is the only function allowed to read it. Both funnels and retention were
also required features. Those two constraints cannot both hold.

A funnel asks: _did this user do B within one hour of doing A?_ The answer depends on the
interval between two individual events belonging to the same person. Time-bucketed
aggregates have destroyed that information by construction. Once events are counted per
hour, the gap between two of them inside the bucket does not exist anywhere. No rollup
shape recovers it, because the rollup is a sum and the question is about ordering.

Retention has the same shape: a user's cohort is the period of their _first_ qualifying
event, which requires knowing which event was first.

**Decision.** `api.funnel` and `api.retention` read `events_raw`. Every other read path
uses rollups.

**How the cost is bounded rather than ignored.**

- Both take an explicit date range and neither has an unbounded default.
- Both are served by a dedicated index on
  `(project_id, distinct_id, event_name, ts)`, added for exactly this purpose. Without it a
  four step funnel over a million events took 1349ms; with it, 170ms.
- Both are naturally limited by the project's raw retention window, so the table they scan
  cannot grow without limit.
- Funnels are capped at eight steps.

**Consequences.** These two screens degrade differently from the rest of the product: they
get slower as raw event volume grows, where the rollup-backed screens do not. That is the
trade, and the deferred section of `docs/ARCHITECTURE.md` records what we would do about it
(a columnar store, or a precomputed step table) and the trigger.

The narrower rule, the one actually worth enforcing, survives intact: **no screen assembles
its own query against `events_raw`.** Access goes through three named functions whose costs
are understood, rather than through whatever a component author writes.

---

## ADR-0010 - Session counts get their own membership table

**Status:** accepted, 2026-09-21

**Context.** The rollup design carried a `session_count` on each hourly row, and "Sessions"
is one of the four headline numbers on the overview screen. Summing that column across
hours is wrong: a session running from 10:55 to 11:05 appears in two hourly buckets and is
counted twice. On the seeded data this overstated sessions by roughly 15%.

This is the same non-additivity that `user_activity_daily` already existed to solve for
unique users. It was simply not applied to sessions.

**Decision.** Add `session_activity_daily`, one row per session per day it was active, and
compute the headline session count as a distinct count over it.

**Why not accept the approximation.** A headline number that is quietly 15% too high is
worse than no number. The customer's first instinct on seeing a figure they doubt is to
check it against their own database, and when it fails to match, every other number on the
screen becomes suspect too. Being 15% wrong costs more credibility than the feature was
ever worth.

**Consequences.** One more table, one more delete-and-insert per touched day in the rollup
job, and a row count proportional to sessions rather than events, which is roughly an order
of magnitude smaller than `events_raw`. `rollup_events_hourly.session_count` is kept,
because it is correct _within_ an hour and is what the hourly-grain chart uses.

---

## ADR-0011 - Email and password sign-in, alongside the magic link

**Status:** accepted, 2026-09-22

**Context.** The brief specified magic link plus GitHub OAuth, and the sign-in screen was
built that way. In practice it made the project awkward to work on. The bootstrap script
creates a demo user with a password because it needs one to sign in from a script, so the
credentials exist and look usable, but there was nowhere to type them. Every local sign-in
meant a detour through the Mailpit inbox, and GitHub OAuth needs credentials that a local
checkout does not have.

**Decision.** Add password sign-in and account creation to the same screen. The magic link
and GitHub stay, and the magic link is still what the end to end sign-in test exercises,
because it is the path that crosses the most services.

**Consequences.**

The screen now has three ways in, which is more surface than one. It stays a single form:
the mode is part of the form values, so the schema validates against it and there is one
submit path rather than three.

The password floor is eight characters, set in the form and in
`auth.minimum_password_length`. A rule that lives only in the browser is not a rule,
because anyone can call the API directly; there is a check that the API refuses seven
characters and accepts eight.

Anyone who can reach the sign-in screen can now create an account with a password. That is
not a new exposure: the magic link already created accounts for unknown addresses, which is
what `shouldCreateUser` defaults to. An account with no organization lands on onboarding
and can see nothing belonging to anyone else, which row level security enforces rather than
the sign-in screen.

Not done: no way to set a password on an account that was created by magic link, and no
password reset. Both are Supabase Auth calls and neither is wired up, so an account created
by link stays link-only.
