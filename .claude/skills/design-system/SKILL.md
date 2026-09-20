---
name: design-system
description: Design tokens, component vocabulary, required states, and copy rules for the analytics dashboard. Load before writing or changing any UI, chart, or route.
---

# Design system - "Instrument"

This is an instrument panel for engineers and product managers. Its job is to let someone
read a number, trust it, and act on it. Density is a feature. Decoration is a liability.

## Tokens

One token file: `apps/web/src/index.css`. No hex literal anywhere else in the codebase. No
arbitrary Tailwind values such as `w-[327px]` without a comment saying why.

    light   canvas #F5F6F8   surface #FFFFFF   border #DFE3E8   text #14181D   muted #5E6773
    dark    canvas #0D1013   surface #161A1E   border #262C33   text #E6EAEE   muted #8D97A3
    accent  #10656B light  /  #3FB8B2 dark        interactive affordances only
    status  ok #2F7D4F   warn #A96410   danger #C23A33    semantic only, never decorative

Chart colors are a separate palette from the UI accent, so data color never competes with
"this is clickable" color. Six series, mid saturation, distinguishable at 2px stroke width,
each with a brightened dark mode counterpart in the token file:

    --chart-1 #1F8A8A   --chart-2 #E0821C   --chart-3 #7B5BD6
    --chart-4 #D64570   --chart-5 #4C8DF6   --chart-6 #6E8F2E

Dark mode is hand tuned, not auto inverted. Light and dark are equally first class and
every screen is reviewed in both.

## Typography

One sans family for the interface. One mono family for values only: the large KPI numbers
and numeric table cells. Never mono for labels, nav, or headers - that is a generated page
tell. Every number in the product carries `font-variant-numeric: tabular-nums` so columns
do not jitter when they update. All numbers are locale aware through `lib/format.ts`.

## Structural signature

Individuality is carried by structure, not only by color.

- A 2px accent rule on the left edge of the active nav item. Nothing else in the UI uses a
  left rule, so it means exactly one thing.
- KPI cards: value in mono at large size, label beneath in small sans, delta as a small
  bordered pill. No icons in KPI cards.
- Tables: hairline vertical separators on numeric columns only. Text columns run open.
- Section headers are one row: title left, controls right, hairline rule beneath.
- One small radius token, around 6px, on everything. Not the 12px rounded card look.

## Component vocabulary

- `components/ui` holds shadcn primitives, unmodified where possible.
- `components/charts` wraps Recharts. A route never imports Recharts directly.
- `components/data` holds DataTable, FilterBar, DateRangePicker, MetricCard.
- `components/layout` holds AppShell, Sidebar, Topbar, PageHeader.
- `components/feedback` holds EmptyState, ErrorState, and the skeletons.

Icons are lucide only, 16px in chrome, consistent stroke width, never decorative.

## Row actions

Table row actions are hover to reveal, and revealed on keyboard focus as well. A control
that appears on hover but not on focus is unreachable by keyboard and is a bug.

## The three states - not optional

Every data surface ships all three in the same commit as its happy path. A chart committed
without its empty state is incomplete.

1. **Loading** - a skeleton shaped like the real content. Not a centered spinner.
2. **Empty** - explains what will appear here and gives one action that makes it appear.
   "No events yet. Install the snippet on your site to start collecting." plus a button.
3. **Error** - says what failed and what to do next. Never "Something went wrong."

## Charts

Horizontal gridlines only, and subtle. Short axis labels. A custom tooltip styled to match
the card it sits in. Fixed height containers so nothing shifts on load. Chart color comes
from the chart tokens, read off custom properties, never from a literal.

## Motion

Motion only in response to a user action. No fade and slide up section entrances. No hover
animation on every card. Respect `prefers-reduced-motion` everywhere.

## Copy rules

Sentence case everywhere. Active voice. Buttons name the action that happens: "Create key",
not "Submit". The action keeps its name through the flow, so "Create key" produces "Key
created". No exclamation marks. Plain nouns users recognise: "API keys", not "credentials
management". Errors do not apologise and are never vague.

## Banned, because they are what generated dashboards default to

Warm cream backgrounds. Terracotta or clay accents. Acid green on near black. SaaS indigo
blue as the primary. Gradient washes. Glassmorphism. Shadows heavier than `shadow-sm`.
ALL CAPS eyebrow labels above headings. An arrow appended to button text. Middle dot meta
strings. Pie charts. Emoji anywhere in the interface.

## Reference discipline

The existing CRM project is a reference for UI craft only: density, restraint, the shadcn
component vocabulary, and hover to reveal row actions. Do not take its palette, do not
approximate it, and do not clone its layout. Different product, different information
architecture.

## Accessibility floor

Every action reachable by keyboard. Focus always visible. Every dialog escapable. Color is
never the only carrier of meaning - pair it with text or shape.
