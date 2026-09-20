---
name: engineering
description: Commit format, chunk size, reporting format, and the debugging rule for this repository. Load at the start of any working session.
---

# Engineering conventions

## Chunk size

One phase, or one feature inside a phase, at a time. After each chunk: stop, report, wait
for confirmation. Do not scaffold future phases ahead to save time. Ten small reviewable
diffs beat one large one.

Do not run ahead of the agreed phase. If the next thing is obviously needed but belongs to
a later phase, say so in the summary and leave it.

## Every summary contains

1. What was done, in plain words.
2. The exact file paths created or changed. Paths, not descriptions of paths.
3. How to verify it works: the command to run and what a correct result looks like.
4. Anything deliberately left out, and why.

## Commits

Conventional commits, scoped where useful:

    feat: add funnel conversion function
    feat(ingest): add batch idempotency
    fix(rollups): advance watermark on empty window
    db: add rollup tables and pg_cron schedule
    docs: write the Supabase teaching guide
    chore: bump supabase cli
    refactor: extract shared cors handler
    test: add two-org RLS isolation suite

Commit and push after every completed feature, or at roughly 200 meaningful changed lines,
whichever comes first. Lockfiles and generated types do not count toward that total.

Never commit `.env`, `.env.local`, service role keys, or anything under `supabase/.temp`.
Keep `.env.example` current: every variable present, documented, values blanked.

If `git push` fails, stop and show the error. Do not force push. Do not rewrite history.

## Debugging

Do not fix a reported problem without first seeing the exact error output. Ask for it.

When something breaks, change one thing at a time. Changing three things and finding it
works tells you nothing about which one mattered, and the other two are now unexplained
code that nobody will dare remove.

Reproduce, then fix, then confirm the reproduction is gone.

## No emojis

Not in code, tests, migrations, scripts, commit messages, or prose documentation. Not in
the interface either - that rule lives in the design system skill.

## Dependencies

Do not add one without saying in the summary what it does and why nothing already installed
covers it. The stack is locked: no Next.js, no Redis, no ORM, no state library beyond
TanStack Query.

## TypeScript

Strict mode, and it stays strict. No `any` that could be `unknown`. No `@ts-expect-error`
without a comment on the same line saying what is expected and when it goes away.
`apps/web/src/types/database.ts` is generated and never hand edited.

## Tests

The tests that matter most in this project, in order:

1. Two orgs cannot see each other's data. Automated, not verified by inspection.
2. Replaying the same ingest batch twice produces the same event count.
3. A 21 day late event lands in its correct historical bucket after the next rollup.

Write those three as real tests before writing convenience tests around them.

## Keep CLAUDE.md current

The "Current state" block in `CLAUDE.md` is updated at the end of every phase: what is
done, what is next, and the known gaps. A stale current state block is worse than none,
because the next session believes it.
