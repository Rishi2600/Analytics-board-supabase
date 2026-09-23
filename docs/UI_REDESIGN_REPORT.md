# Frontend redesign report

## 1. What this set out to fix

The dashboard worked, but it looked generated, and it had problems a first look did not
show. On a phone the navigation covered half the screen and hid the numbers. The chart
colors never appeared: every line was drawn in the text color. Row actions such as "Revoke"
only appeared when a mouse hovered, so a phone could not reach them. Worst, four screens
never loaded for a real signed-in user. The goal was a calmer, more trustworthy interface
that works everywhere, with every screen actually showing its data.

## 2. The new look

- **Colors.** A cool grey page, white panels, and one petrol-teal accent that only ever
  means "you can click this". Charts use a separate set of colors (blue, amber, violet,
  rose, olive, slate), so a chart line is never mistaken for a button. Dark mode is a
  graphite with a slight blue cast, tuned by hand rather than inverted.
- **Type.** Geist for words, Geist Mono for numbers only. Mono is a typeface where every
  character is the same width, so columns of figures line up.
- **What makes it distinctive.** Every data screen has a _provenance line_ under its title:
  the timezone the numbers use, the date range, and how fresh the totals are. If the
  background job that adds up events falls behind, that line says so in words. The four
  headline numbers sit in one strip, read as one instrument, rather than four floating cards.

The full design is in `docs/DESIGN_SYSTEM.md`.

## 3. Screen by screen

The screenshots are not in git; that folder is ignored on purpose. Run
`npm run screenshots -- --out docs/screenshots/after` to produce the after images. The
before images were taken on this machine; to recreate them, run the same script against a
checkout of commit `9ed655b`. Every screen has
light and dark versions, phone and desktop widths, and loading, empty and error versions.

| Screen           | What changed, and why                                                                                                                                                                                             | Before / after                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Overview         | The headline numbers now load; they took 91 seconds before. Top pages and top countries now load; they always failed. One KPI strip with arrow-and-sign changes. The chart has real colors and a legend.          | `before/overview-default-light-1440.png` / `after/…`  |
| Events explorer  | The breakdown works. Filters are labelled form fields. Saved views can be deleted only by their author, and deleting asks first.                                                                                  | `before/events-default-light-1440.png` / `after/…`    |
| Live             | The status is a word, not a pulsing dot. The filter has a label. Rows stack on a phone, and each opens the full event.                                                                                            | `before/live-default-light-1440.png` / `after/…`      |
| Funnels          | It loads now; before it never finished. The step builder and the result are clearer, and drop-off is said in words.                                                                                               | `before/funnels-default-light-1440.png` / `after/…`   |
| Retention        | It loads now. Cohort dates are readable. Weeks a cohort has not reached yet show a dash, not a misleading 0%. The Weekly/Monthly choice is clearly visible.                                                       | `before/retention-default-light-1440.png` / `after/…` |
| Reports          | All three export types work; two always failed. "Property breakdown" asks which property. Status is a word with an icon, errors are sentences, and Download is always visible.                                    | `before/reports-default-light-1440.png` / `after/…`   |
| Ingestion health | Refusal reasons are explained with what to do about each. Every state has a word next to its color. Hourly chart labels include the date.                                                                         | `before/health-default-light-1440.png` / `after/…`    |
| Settings         | Tabs scroll on a phone. Revoke, remove member, and lowering how long raw events are kept all ask first. The timezone list is searchable. Install no longer says "waiting for your first event" on a busy project. | `before/settings-default-light-1440.png` / `after/…`  |
| Onboarding       | Searchable timezone. "New project" works for people who already have an organization; before, the form could never be submitted. There is a way to sign out.                                                      | `before/onboarding-default-light-375.png` / `after/…` |
| Sign in          | Theme control before signing in. Errors appear in a clear box. Buttons show progress.                                                                                                                             | `before/sign-in-default-light-375.png` / `after/…`    |

Across every screen: a skip link for keyboard users, a browser-tab title per screen, a
recovery screen if a page crashes, and the product's own favicon.

## 4. Changes outside the frontend

Each change was made because a screen needed it.

- **Overview, Funnels, Retention: three read functions now run as the database owner and
  check access once** (migration `…170009`, ADR-0013). Row level security, the database
  rule that limits each person to their own organization's data, was checking every row.
  Result for a signed-in user: 91s to 40ms, 43s to 255ms, over 60s to 295ms. Three new
  tests prove other organizations still see nothing.
- **Overview: two indexes** so session and user counts over long ranges stay fast.
- **Overview and Events: `api.breakdown` fixed.** A number type mismatch made it fail on
  every call.
- **Reports: the export worker can reach the functions it needs** (migration `…173841`,
  approved by you). Two of three export types always failed. Two new tests.
- **Reports: export errors reach the screen.** The screen now shows the server's own
  message instead of a generic one, and failures are stored as sentences, not JSON.
- **Seed data:** `scripts/seed-demo-extras.ts` adds refused events, saved views, exports and
  a second member, all through the real endpoints.
- **Tooling:** `?state=` forces any screen into loading, empty or error in development, and
  a build check proves it never ships. `scripts/screenshots.ts` captures everything.
- **Review skill:** the `design-review` skill sent reviewed code to a third party. Those
  parts were removed (ADR-0012).

## 5. What the reviews found

The first review found 16 problems, 8 of them serious: things that block a task or hide
information. All 16 are fixed, plus 3 minor ones. The last review, on the same three flows,
found nothing serious. Automated checks: no sideways scrolling on any screen at 320px wide
or at 200% zoom, and every color pair measured against the accessibility standard.

Along the way the redesign also found and fixed five hidden bugs. Refused deletes were
reported as done. The install tab waited forever. The Property breakdown export could not
work. "New project" never submitted. Retention showed 0% for weeks that had not happened.

## 6. What is left

- **Summary over 30 days is on the 300ms line** (288 to 336ms). The proper fix is a new
  table, so it needs your decision.
- **Custom date ranges and an automated accessibility checker** each need a new library.
- **Charts have no table view** for screen reader users.
- **Small polish items** are listed at the end of `docs/DESIGN_SYSTEM.md`.
- **Checkpoints:** you asked me to work straight through, so the `/interface-review`
  checkpoints did not happen. The full range is `main..ui-redesign`, 23 commits.
- **Commit hygiene:** the redesign itself went in as one large commit (`52eb65c`). Commit
  `3fe8849` also carries three file deletions that belong to it. I did not rewrite history.

## 7. How to check it yourself

```bash
npm run verify                     # lint, format, types, 30 unit tests, build
npm run test:db                    # 68 database tests, needs the stack
npm run functions                  # in a second terminal
npm run test:e2e                   # 15 browser tests
node scripts/seed-demo-extras.ts   # optional: fill every panel
npm run dev                        # sign in as demo@example.test
```

Then open Overview, Funnels and Retention and see them load. Make the window 320px wide.
Add `?state=error` to any URL. Try revoking a key and pressing Escape.
