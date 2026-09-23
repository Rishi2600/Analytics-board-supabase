# Design system - "Instrument"

An instrument panel for engineers and product managers. Someone opens it because a number
moved, and they need to know whether the move is real, why it happened, and what to do.
Everything below serves one job: read a number, trust it, act on it.

This is the second version of this document. It was rewritten for the frontend redesign in
September 2026. The last section says what was kept from the first version, what changed,
and why.

## The one idea

**Every number says where it came from.**

An analytics tool gets checked against the customer's own database once. If it is off by a
timezone or a stale rollup, it is never trusted again. So every data screen carries a
**provenance line** directly under its title: the timezone the numbers are cut in, the date
range, and how fresh the aggregates are. When rollups fall behind, that line says so in
words, with an icon, next to the numbers it affects.

This is the one place the design spends its boldness. Everything else is quiet.

## Color

One token file, `apps/web/src/index.css`. No hex anywhere else. Components use semantic
classes such as `bg-card` and `text-muted-foreground`, never raw colors and never `dark:`.

### Interface

| Role            | Light     | Dark      | Job                                    |
| --------------- | --------- | --------- | -------------------------------------- |
| canvas          | `#F5F6F8` | `#11161B` | the page behind everything             |
| surface         | `#FFFFFF` | `#181E24` | cards, tables, popovers                |
| muted surface   | `#EEF0F3` | `#1F262D` | hover rows, code blocks, tab rails     |
| border          | `#DFE3E8` | `#2A323B` | hairlines, one weight only             |
| input border    | `#8B949F` | `#5B6570` | form controls, 3:1 against the surface |
| text            | `#14181D` | `#E4E9EE` | reading color                          |
| muted text      | `#5E6773` | `#8F9AA6` | labels, axis ticks, meta               |
| accent (petrol) | `#10656B` | `#3FB8B2` | interactive affordances only           |

Dark is a graphite with a slight blue-slate cast, not a tinted near-black. It is tuned by
hand: the dark accent is a different color, not the light one lightened.

Measured contrast: text on surface 17.8 light, 13.8 dark. Muted text on surface 5.7 light,
5.9 dark. Accent on surface 6.8 light, 7.0 dark.

### Status

| Role   | Light     | Dark      |
| ------ | --------- | --------- |
| ok     | `#2F7D4F` | `#4CAF72` |
| warn   | `#A96410` | `#D9932F` |
| danger | `#C23A33` | `#E4655C` |

A status color means a state the user can act on. It always travels with a word or an icon,
never alone.

### Charts

A separate palette from the accent. If the "this is clickable" color also draws a line, the
user learns that teal means nothing in particular.

| Token       | Light     | Dark      | Hue              |
| ----------- | --------- | --------- | ---------------- |
| `--chart-1` | `#2F6FDB` | `#6B9BF2` | blue             |
| `--chart-2` | `#D9771A` | `#F0A04B` | amber            |
| `--chart-3` | `#7B5BD6` | `#A08BEA` | violet           |
| `--chart-4` | `#D64570` | `#EC7D95` | rose             |
| `--chart-5` | `#5F8A2A` | `#8FB349` | olive            |
| `--chart-6` | `#6B7A8C` | `#97A4B4` | slate, used last |

Every series clears 3:1 against the surface it draws on, in both themes. The nearest series
to the accent is 34 degrees of hue away. Six is a ceiling: past six lines, a breakdown
table beats a seventh color. Charts are built on shadcn `Chart`, which feeds these tokens
to Recharts, and every chart with more than one series shows a legend.

Single-value fills (bar lists, funnel bars, the retention grid) use `--chart-1`. The
retention grid mixes it at most 55 percent into the surface, which keeps the printed
percentage at 4.5:1 or better in both themes.

## Typography

- **Geist** for the interface: labels, navigation, headings, body, buttons.
- **Geist Mono** for values only: KPI numbers and numeric table cells.

Mono for labels, step numbers or dates is the clearest tell of a generated page. Every number
carries tabular figures, and every number is formatted through `lib/format.ts`.

| Step    | Size             | Used for                            |
| ------- | ---------------- | ----------------------------------- |
| kpi     | 28px mono        | the number in a KPI cell            |
| title   | 18px sans medium | page title                          |
| section | 14px sans medium | card title, table header            |
| body    | 14px sans        | everything else                     |
| meta    | 12px sans        | axis ticks, provenance, helper text |

## Layout

- **Shell.** shadcn `Sidebar`: full width on desktop, collapsible to icons, and a sheet on
  phones. A sticky top bar holds the sidebar trigger, the project switcher, a search button
  that opens the command palette, the theme menu and the account menu.
- **Page header.** Title and actions on one row. The provenance line beneath. Actions wrap
  under the title on narrow screens rather than squeezing it.
- **KPI strip.** One card divided into cells by hairlines, not four identical floating cards.
  Four across on desktop, two by two on phones. Read as one instrument.
- **Panels.** shadcn `Card` with a one-row header: title left, control right.
- **Tables.** shadcn `Table`. Hairline vertical rules on numeric columns only. Wide tables
  scroll inside their own container.
- **Content** is left aligned. Nothing is centered except empty and error states.
- **Radius** 6px on everything.

### Overview

```
+---------------------------------------------------------------------------------+
| [=] Acme / Web app v   [ Search screens and projects   Ctrl K ]     [sun] [RS]  |
+----------+----------------------------------------------------------------------+
| Acme     | Overview                                           [ Last 7 days v ] |
|          | (globe) Asia/Kolkata   (cal) 16 Sep - 23 Sep   (clock) Updated 2m ago |
| |Overview| -------------------------------------------------------------------- |
|  Events  | +------------------+-----------------+-----------------+-----------+ |
|  Live    | | 58,844           | 4,974           | 18,496          | 11.8      | |
|  Funnels | | Total events     | Unique users    | Sessions        | Events/usr| |
|  Retain  | | [v -38.9%]       | [v -9.2%]       | [v -48.3%]      | [v -32.8%]| |
|  Reports | +------------------+-----------------+-----------------+-----------+ |
|  Health  | +------------------------------------------------------------------+ |
|  Settings| | Events over time                                          Daily  | |
|          | |  6k |      ___                                                  | |
|          | |     |  ___/   \____                                           | |
|          | |   0 +------------------------------------------------------   | |
|          | |  (o) page_view  (o) session_start  (o) signup_started  ...    | |
|          | +------------------------------------------------------------------+ |
|          | +-------------------------------+ +-------------------------------+ |
|          | | Top events                    | | Top pages                     | |
|          | | page_view      18,329   31.2% | | /pricing       8,102    14.1% | |
+----------+----------------------------------------------------------------------+
```

### Events explorer

```
+----------+----------------------------------------------------------------------+
|          | Events explorer                       [ Last 30 days v ] [Save view] |
|          | (globe) Asia/Kolkata   (cal) 24 Aug - 23 Sep   (clock) Updated 2m ago |
|          | +------------------------------------------------------------------+ |
|          | | Event            Where property   is        Break down by         | |
|          | | [checkout v]     [plan v]         [pro   ]  [country v]           | |
|          | | One property filter at a time. Why                                | |
|          | +------------------------------------------------------------------+ |
|          | +------------------------------------------------------------------+ |
|          | | checkout_completed over time                              Daily  | |
|          | +------------------------------------------------------------------+ |
|          | +------------------------------------------------------------------+ |
|          | | Breakdown by country      | Events   | Share                     | |
|          | | IN                        |   18,204 | 62.1%                     | |
|          | | __other__                 |    1,220 |  4.2%                     | |
|          | +------------------------------------------------------------------+ |
|          | | Saved views                                                      | |
+----------+----------------------------------------------------------------------+
```

### Settings

```
+----------+----------------------------------------------------------------------+
|          | Settings                                                             |
|          | Web app                                                              |
|          | [ Install | Project | API keys | Members | Audit log ]  (scrolls)      |
|          | +------------------------------------------------------------------+ |
|          | | API keys                                            [Create key] | |
|          | | Keys let your app send events. Shown once, stored as a hash.     | |
|          | | Name         | Prefix        | Type    | Last used  |            | |
|          | | Web (prod)   | pk_live_8fa2  | Public  | 2 min ago  |  [Revoke]  | |
|          | | Old key      | pk_live_00b1  | Revoked | -          |            | |
|          | +------------------------------------------------------------------+ |
+----------+----------------------------------------------------------------------+
```

Row actions reveal on hover and on keyboard focus within the row. On touch devices, where
nothing hovers, they are always visible. Every destructive action goes through
`AlertDialog`, says what will happen, and repeats the verb on its button.

## Principles

1. **The number is the interface.** The largest thing on a screen is a value. Everything
   else qualifies it.
2. **Every number says where it came from.** Timezone, range and freshness sit next to the
   data, in the provenance line, not in settings.
3. **Color encodes data or interaction, never both.** Two palettes, kept apart on purpose.
4. **Every surface states its own emptiness.** Loading, empty and error are designed, not
   left over. An error names what to do next.
5. **Density is a courtesy.** Comparison needs proximity. Whitespace between two numbers
   someone is comparing is an obstacle.

## States

Every data surface has three, built on shadcn:

- **Loading**: `Skeleton`, shaped like the content it stands in for.
- **Empty**: `Empty`, with what will appear and one action that makes it appear.
- **Error**: `Alert` with the destructive variant, what failed, and a retry.

Any screen can be forced into a state in development with `?state=loading`, `?state=empty`
or `?state=error`. See `apps/web/src/lib/dev-state.ts`.

## Motion

Only in response to a user action. No entrance animations, no hover lift, no pulsing status
dots. Live numbers change without a transition. `prefers-reduced-motion` is respected.

## Copy

Sentence case. Active voice. Buttons name what happens, and the name carries through the
flow: "Create key" produces "Key created". No exclamation marks. No apologies. Database
values such as `queued` or `admin` are never printed raw; each has a label.

## Banned

Warm cream backgrounds. Terracotta or clay accents. Acid green on near-black. SaaS indigo as
the primary. Gradient washes. Glassmorphism. Shadows heavier than `shadow-sm`. Identical
floating cards for every metric. All-caps eyebrow labels. Arrows appended to button text.
Middle-dot meta strings. Numbered markers on content that is not a sequence. Pie charts.
Fade-and-slide-up entrances. Hover animation on every card. Emoji.

## Kept, changed, and why

**Kept.** Petrol teal as the accent, because it reads as measurement rather than marketing.
Geist and Geist Mono, because they are installed and well matched, and a font change would
be a new dependency for no gain in trust. The 2px left rule on the active nav item. The 6px
radius. The five-step type scale. The status colors. The five principles, reworded.

**Changed.**

1. **Chart series 1 was teal, 34 degrees closer to the accent.** The first version named this
   as "the one collision worth watching". It was used for bar fills too, as the accent itself,
   so data and interaction shared a color. Series 1 is now blue; teal belongs to the accent.
2. **Series 6 is slate.** The sixth series is usually the long tail, and a neutral says so.
3. **The dark canvas moved from `#0D1013` to a graphite `#11161B`.** The old value was the
   tinted near-black every generated dark theme uses. The new one has a deliberate cast and
   a clearer step to the surface.
4. **Input borders got their own token.** The hairline border is 1.3:1 against the surface,
   fine for dividers and too faint for a form control, which needs 3:1.
5. **The KPI row became one strip.** Four identical cards with the same border is the
   generic kit. One instrument with four readouts is denser and reads as a single thing.
6. **The provenance line is new.** It turns principle two into structure: the first version
   put only the timezone next to the title.

## Polish backlog

Low findings from reviews, kept here until someone picks them up.

- Custom date ranges. The picker offers presets only; a calendar needs `react-day-picker`, a
  new dependency.
- Charts expose a legend and tooltip, but no table view of the underlying numbers for
  screen reader users.
