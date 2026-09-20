# Design system - "Instrument"

The design pass. Written before any interface code, reviewed once against a single
question: would this be the same document for any dashboard? Where the answer was yes, it
was changed. The changes are listed at the end.

## What this product is

An instrument panel for engineers and product managers. Someone opens it because a number
moved and they need to know whether that is real, why it happened, and what to do. Every
decision below serves reading a number and trusting it.

Trust is the hard part. An analytics tool that is merely pretty gets checked against the
customer's own database once, found to be off by a rounding error or a timezone, and never
believed again. So the interface has to show its work: which timezone, how fresh, how many
events were rejected, when the last rollup ran. That obligation shapes the layout more
than any aesthetic preference does.

## Color

One token file, `apps/web/src/index.css`. No hex literal lives anywhere else.

### Interface

| Role    | Light     | Dark      | Notes                              |
| ------- | --------- | --------- | ---------------------------------- |
| canvas  | `#F5F6F8` | `#0D1013` | the page behind everything         |
| surface | `#FFFFFF` | `#161A1E` | cards, tables, popovers            |
| border  | `#DFE3E8` | `#262C33` | hairlines, one weight only         |
| text    | `#14181D` | `#E6EAEE` | primary reading colour             |
| muted   | `#5E6773` | `#8D97A3` | labels, axis ticks, secondary meta |
| accent  | `#10656B` | `#3FB8B2` | interactive affordances only       |

Petrol teal, because it reads as measurement rather than as SaaS marketing, and because it
leaves the entire warm half of the wheel free for chart series without collision. The dark
accent is a genuinely different colour, not the light one lightened: `#10656B` on a dark
canvas is mud, and `#3FB8B2` on white fails contrast against small text.

### Status

| Role   | Light     | Dark      |
| ------ | --------- | --------- |
| ok     | `#2F7D4F` | `#4CAF72` |
| warn   | `#A96410` | `#D9932F` |
| danger | `#C23A33` | `#E4655C` |

Semantic only. A status colour in this product means a state the user can act on: ingestion
is healthy, rollups are lagging, a key was revoked. It is never used because a card needed
some colour.

### Charts

A separate palette from the interface accent, and that separation is the single most
important colour decision here. If the "this is clickable" colour also appears as series
three in a line chart, the user learns that teal means nothing in particular, and the
affordance is gone.

| Token       | Light     | Dark      |
| ----------- | --------- | --------- |
| `--chart-1` | `#1F8A8A` | `#37A8A8` |
| `--chart-2` | `#E0821C` | `#F0A04B` |
| `--chart-3` | `#7B5BD6` | `#9B81E8` |
| `--chart-4` | `#D64570` | `#E8738C` |
| `--chart-5` | `#4C8DF6` | `#6FA6FF` |
| `--chart-6` | `#6E8F2E` | `#8FB349` |

Six series, mid saturation, all distinguishable at a 2px stroke. Six is a deliberate
ceiling: past six lines nobody can read a legend, and the right answer is a breakdown
table, not a seventh colour.

Series one is teal-adjacent but darker and greener than the interactive accent, which is
the one collision worth watching in review.

## Typography

- **Interface: Geist.** Labels, navigation, headers, body, buttons.
- **Values: Geist Mono.** Only the large KPI numbers and numeric table cells.

Mono for numbers and nothing else. Mono for labels or navigation is the clearest tell of a
generated page, and it costs real legibility. Mono for values earns its place: a column of
figures in a proportional face jitters as it updates, and comparing magnitudes between rows
becomes a reading task rather than a glance.

Every number in the product carries `font-variant-numeric: tabular-nums`, including
proportional-face numbers in prose. Every number is formatted through `lib/format.ts`, so
locale and unit handling live in one place.

Scale, and what each step is for:

| Step    | Size             | Used for                            |
| ------- | ---------------- | ----------------------------------- |
| kpi     | 30px mono        | the number on a KPI card            |
| title   | 18px sans medium | page title                          |
| section | 14px sans medium | section header, table header        |
| body    | 14px sans        | everything else                     |
| meta    | 12px sans        | axis ticks, timestamps, helper text |

Five steps. A sixth would be someone avoiding a layout decision.

## Structural signature

Identity carried by structure, so it survives a palette change.

- **A 2px accent rule on the left edge of the active navigation item.** Nothing else in the
  product uses a left rule, so it means exactly one thing: you are here.
- **KPI cards**: value in mono at 30px, label beneath in 12px sans, delta as a small
  bordered pill. No icons. An icon on a KPI card is decoration competing with the number.
- **Tables**: hairline vertical separators on numeric columns only. Text columns run open.
  The rules exist to help the eye track down a column of figures, which text does not need.
- **Section headers are one row.** Title left, controls right, hairline rule beneath.
- **One radius, 6px, everywhere.** Not the 12px rounded-card look that reads as consumer
  software.
- **One border weight.** Depth comes from the canvas-to-surface step, not from shadows.
  Nothing heavier than `shadow-sm`, and that only on things that genuinely float.

## Wireframes

### Overview

```
+----------------------------------------------------------------------------+
| [=] Acme / Web  v          Overview                      [Last 7 days v] [O]|
+--------+-------------------------------------------------------------------+
|        | Overview                                    Asia/Kolkata  [Export] |
| |Over  | ------------------------------------------------------------------|
|  Events| +-------------+ +-------------+ +-------------+ +-------------+    |
|  Live  | | 1,284,402   | | 48,201      | | 92,118      | | 26.6        |    |
|  Funnel| | Total events| | Unique users| | Sessions    | | Events/user |    |
|  Retain| | [+12.4%]    | | [+4.1%]     | | [-0.8%]     | | [+7.9%]     |    |
|  Report| |  ....-``''- | |  ..--''`    | | `''--..     | |   .-'`'-.   |    |
|  Health| +-------------+ +-------------+ +-------------+ +-------------+    |
|  Settin| ------------------------------------------------------------------|
|        | Events over time                          [All events v] [Daily]   |
|        | ----------------------------------------------------------------- |
|        |  40k |                                        _/\_                 |
|        |      |                            __/\__/\__/     \__              |
|        |  20k |          __/\__/\__/\__/                                    |
|        |      |_/\__/\__/                                                   |
|        |   0  +---------------------------------------------------------    |
|        |      Sep 14   Sep 15   Sep 16   Sep 17   Sep 18   Sep 19   Sep 20  |
|        | ------------------------------------------------------------------|
|        | Top events                    | Top pages                          |
|        | ----------------------------- | ---------------------------------- |
|        | page_view        | 412,880    | /pricing            | 88,102       |
|        | session_start    |  92,118    | /                   | 71,440       |
|        | checkout_started |  18,204    | /docs/quickstart    | 44,919       |
+--------+-------------------------------------------------------------------+
```

The timezone sits next to the title, not buried in settings, because every number on the
screen depends on it.

### Events explorer

```
+----------------------------------------------------------------------------+
|        | Events explorer                    Asia/Kolkata   [Save as view]   |
|        | ------------------------------------------------------------------|
|        | [checkout_completed v]  [Last 30 days v]  [Break down by: plan v]  |
|        | ------------------------------------------------------------------|
|        | Where  [plan      v] [is        v] [pro        ]  [x]              |
|        |  and   [country   v] [is not    v] [IN         ]  [x]              |
|        | [+ Add filter]                                 [AND | OR]          |
|        | ------------------------------------------------------------------|
|        |  1.2k |        pro   ____----''''''''----____                      |
|        |       |  free  ..----                       ----..                 |
|        |    0  +-----------------------------------------------------       |
|        |       Aug 22                                          Sep 20       |
|        | ------------------------------------------------------------------|
|        | plan      | Events   | Users   | Share  |                          |
|        | --------- | -------- | ------- | ------ |                          |
|        | pro       |   18,204 |   4,118 |  62.1% |                          |
|        | free      |    9,882 |   7,240 |  33.7% |                          |
|        | __other__ |    1,220 |     980 |   4.2% |                          |
+--------+-------------------------------------------------------------------+
```

`__other__` is shown, never hidden. A breakdown that silently drops the tail teaches people
that the percentages add up when they do not.

### Settings

```
+----------------------------------------------------------------------------+
|        | Settings                                                           |
|        | ------------------------------------------------------------------|
|        | [ Project ] [ API keys ] [ Members ] [ Audit log ] [ Danger zone ]  |
|        | ------------------------------------------------------------------|
|        | API keys                                          [Create key]     |
|        | ------------------------------------------------------------------|
|        | Name          | Prefix         | Type   | Last used   |            |
|        | ------------- | -------------- | ------ | ----------- | ---------- |
|        | Web (prod)    | pk_live_8fa2   | public | 2 min ago   |    [Revoke]|
|        | Server        | sk_live_11c0   | secret | 4 days ago  |    [Revoke]|
|        | Old key       | pk_live_00b1   | public | revoked     |            |
|        | ------------------------------------------------------------------|
|        | A key is shown once, when you create it. We store only a hash, so   |
|        | we cannot show it again. Revoking keeps the record and stops the    |
|        | key working.                                                        |
+--------+-------------------------------------------------------------------+
```

Revoke appears on hover and on keyboard focus. A revoked key keeps its row, because the
question after an incident is which key was used, not which keys still work.

## Principles

1. **The number is the interface.** The largest thing on any screen is a value, not a
   heading, not an illustration. Everything else is there to qualify it.
2. **State the uncertainty next to the number.** Timezone, date range, rollup freshness and
   rejected-event counts appear beside the data they qualify, not in a settings page. A
   tool that hides its caveats gets checked once and discarded.
3. **Colour encodes data or interaction, never both.** Two palettes, kept apart on purpose.
   If teal ever means "series three", it has stopped meaning "clickable".
4. **Every surface states its own emptiness.** A chart with no data explains what will
   appear there and how to make it appear. This is the difference between a new user who
   installs the snippet and one who closes the tab.
5. **Density is a courtesy.** Comparison requires proximity. Generous whitespace between
   two numbers someone is trying to compare is not elegance, it is an obstacle.

## Motion

Only in response to a user action. No section entrance animations, no hover lift on cards.
Live-updating numbers change without a transition, because an animated number cannot be
read while it animates. `prefers-reduced-motion` is respected throughout.

## Copy

Sentence case. Active voice. Buttons name the action that happens, and keep that name
through the flow: "Create key" produces "Key created". No exclamation marks. Plain nouns:
"API keys", not "credentials management". Errors say what failed and what to do, never
"Something went wrong".

## Banned

Warm cream backgrounds. Terracotta or clay accents. Acid green on near-black. SaaS indigo
as the primary. Gradient washes. Glassmorphism. Shadows heavier than `shadow-sm`. ALL CAPS
eyebrow labels. Arrows appended to button text. Middle-dot meta strings. Pie charts. Emoji.

## What the review changed

The first draft of this document was generic in four places. What changed, and why:

1. **The type scale had seven steps and no stated purpose per step.** That is the shape of
   a scale copied from a system, not designed for a product. Cut to five, each with a named
   job. A step nobody can name a use for is a step someone will misuse.
2. **Chart series one was the interactive accent.** Convenient, and wrong: it is precisely
   the collision principle three exists to prevent. Series one is now darker and greener
   than the accent, and the two are checked side by side rather than assumed distinct.
3. **The dark palette was the light palette inverted.** `#10656B` on `#0D1013` is unreadable
   mud. Dark now has its own hand-picked accent and its own brightened chart series, which
   is why the table above has two columns rather than a note saying "auto-inverted".
4. **There was no rule about where uncertainty is displayed.** That was the generic-dashboard
   tell: it described how things look and said nothing about what this product has to prove.
   Principle two, and the timezone in the page header of both wireframes, came out of that.
