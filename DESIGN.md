---
# gstack: design-md-format=spec
name: Uma Legacies
description: A quiet planning instrument, dark and ruled, where one number is large and everything else is evidence.
colors:
  primary: "#E9EAEE"
  on-primary: "#121317"
  surface: "#1B1D23"
  text: "#E9EAEE"
  text-muted: "#A7ABB6"
  accent: "#E8A33D"
  success: "#7FCB8F"
  warning: "#E8A33D"
  error: "#F2777A"
  paper: "#121317"
  text-faint: "#8A8F9B"
  rule: "#31353F"
  rule-strong: "#4A4F5C"
  track: "#262A33"
  spark-blue: "#7FB0F5"
  spark-pink: "#F58AB6"
  spark-green: "#7FCB8F"
  spark-white: "#D5D8E0"
typography:
  display:
    fontFamily: IBM Plex Mono
    fontWeight: 500
    fontSize: clamp(2.5rem, 5vw, 3.5rem)
    letterSpacing: -0.02em
  body:
    fontFamily: Instrument Sans
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: IBM Plex Mono
    fontSize: 0.625rem
    letterSpacing: 0.08em
  mono:
    fontFamily: IBM Plex Mono
    fontFeature: tnum
rounded:
  sm: 2px
  md: 3px
  lg: 4px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "#FFFFFF"
  input:
    borderColor: "{colors.rule}"
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.md}"
  nav-link:
    textColor: "{colors.text-muted}"
---

# Uma Legacies

## Overview

**Creative North Star:** A quiet planning instrument. One number is large, everything else is
evidence, and colour appears only where data lives.

**Product context:** A companion tool for *Umamusume: Pretty Derby*. It reads a player's own
trained-character roster and helps plan the next career run, answering what the game refuses to:
exact affinity numbers and per-spark inheritance odds. Its single claim is that every number
opens onto the master-database rows that produced it. The audience is the builder first, then
players who plan lineages seriously. Neighbours: `hakuraku.moe`, `breeding-optimizer`, gametora.

**Mode per surface:** Operate throughout. There is no marketing surface and no Persuade mode
anywhere in this product.

**Reference sites:** `https://hakuraku.moe` (studied 2026-09-14; the incumbent).

**Key characteristics:**
- Exactly one number on the screen is large. Every other numeral is 10-18px mono.
- Colour is never a fill. A spark's hue survives as a 3px tick and a bar, nothing else.
- Aggregate numbers print their own addends underneath, permanently, at 10px.
- Two typefaces, no display face. The headline is set in the same mono as every other figure.
- Cards exist only where a card is a thing (a tree node). Nothing else is a card.

## Colors

**Strategy:** Restrained. The interface itself has **no brand colour**. Every hue on screen
belongs to the game's data and carries meaning; the chrome is achromatic.

**Light or dark:** Dark. Decided by the builder on 2026-09-14 against the recommendation of two
independent design voices, both of which argued light from the use scene (a second screen open
for minutes at a time). Recorded as the builder's call; revisit only with new evidence.

**Named rules:**
- **Interaction is achromatic.** `primary` is ink on paper — a white button, a white focus ring.
  Nothing clickable is ever a spark colour, because a coloured control would read as a datum.
  This is the single largest departure from the incumbent, whose filter buttons reuse the five
  spark hues.
- **`accent` (#E8A33D) means "added" and nothing else.** It marks bonus affinity, always
  prefixed `+`. It never appears on navigation, buttons, or state.
- **The four spark colours are category identity, not decoration.** blue = stat, pink =
  aptitude, green = unique, white = skill/race/scenario. They are not in `master.mdb` — the game
  dictates the category names only, so these hex values are this project's choice, picked to hold
  contrast on the dark ground.
- **Three zeros, three treatments.** A genuine zero ("they share nothing") is plain ink. An
  absent ancestor is calm: muted, dashed, no colour. An unresolved lookup is `error` red and
  names its reason and id. Never collapse them into one grey `0`.
- **Semantic colours stay out of the data surface.** `success` / `warning` / `error` appear in
  system chrome only. Inside a table or tree, red means unresolved and amber means bonus.
- **Contrast is verified by eye below 3:1.** WCAG ratios compress near black: `#121317` against
  `#1B1D23` is a visible step that computes as 1.10:1. Text is held to measured ratios (ink
  14.0:1, faint 5.2:1, accent 7.8:1); surface and rule separation is judged by rendering.

## Typography

**There is no display face.** A planning tool does not need a display voice, and the one it had
read as trying too hard. The headline number is IBM Plex Mono at `display` size, because it is a
number and that is the number face. Two families total.

- **IBM Plex Mono** carries every numeral and every label: the headline total, individual
  affinity, star counts, percentages, carrier slots, provenance lines, and section rubrics.
  Chosen for unambiguous figures at 10px (slashed zero, flat-topped 1) and a narrow advance that
  keeps a seven-column table inside one screen. `font-variant-numeric: tabular-nums lining-nums`
  globally, never disabled.
- **Instrument Sans** is the only neutral voice: names, controls, prose. It is never coloured.
  Taken under the role-scoped exception for body/UI on an Operate surface.

Both load from Google Fonts with `preconnect`, `display=swap`, and a real fallback stack.

**Scale:** 56 / 18 / 16 / 13 / 12 / 11 / 10. The gap between 18 and 56 is deliberate and carries
the hierarchy; nothing occupies it.

## Layout

Single column, max 900px, centred. Content-driven widths, never full-bleed by habit.

**The pedigree tree** is four grandparent cards across, two parent cards each spanning two
columns, and the trainee centred below. Connectors are orthogonal brackets: each child drops to
a shared horizontal bus, the bus drops to its parent. Edge labels sit on each child's drop, on
the page ground, never on a card. Tiers are separated by 64px, which is the room the brackets
need once card padding is accounted for.

**The audit trail** is a seven-column table at 30px rows, grouped by spark category, sorted by
inheritance odds within each group. It is dense on purpose: roughly 50 rows should be scannable
without pagination.

**Density:** the tree gets air, the table gets density. The tree is the decision surface; the
table is the audit trail.

**The page body never scrolls horizontally.** The tree needs ~1038px and the audit trail ~560px,
both wider than a phone. Each gets its own `overflow-x: auto` region with side padding, rather
than reflowing: a pedigree whose tiers stack is no longer a pedigree, and every column of the
table is part of the audit. What the tree should actually do at 375px is still open.

## Elevation & Depth

There is none. No shadows, no glows, no layering. Depth is not a concept in this interface:
surfaces are distinguished by a 1px border and a one-step surface change, and that is all. A
zero-offset coloured halo is never acceptable.

## Shapes

The radius hierarchy is nearly flat on purpose: `sm` 2px for inline chips and label pills, `md`
3px for cards and controls, `lg` 4px reserved, `full` for portraits only. Large uniform radii
read as consumer-app softness and would fight the ruled, tabular character of everything else.
On nested elements, inner radius = outer radius − gap.

## Components

**card** — the only card in the system is a tree node, because a node is a discrete entity and
the border is what makes it read as one. Surface `#1B1D23` on paper `#121317` separates at
1.10:1, so the 1px `rule` border is load-bearing, not decorative. The trainee card takes
`rule-strong`. Nothing else in the product is a card: the table is a table, panels are ruled
regions.

**Node internals** — portrait 48px circle at the card's top-right (54px on the trainee, centred),
served from an optional local cache so the initials disc is a routine state rather than an error;
name and individual affinity to its left; the provenance line full width beneath it, clear of the
portrait's lower edge, never wrapping mid-sum. Then the spark lines: blue, pink, green each named
with its star level, then the whites as a bare count, pluralised. **The trainee node has no spark
lines**: it has not been trained, so placeholders there would claim data is missing rather than
state a fact about the game. An ancestor with no spark data at all gets one line saying so, never
four negatives.

**Spark row** — a 3px colour tick at the left edge, name, star total, carrier slots, odds bar,
two percentages. White sparks use an outlined tick rather than a filled one. No pills anywhere.

**States** — hover: surface lifts one step. focus-visible: 2px `primary` ring, offset 2px, never
removed. active: no transform. disabled: `text-faint`, no pointer events.

**Browser surfaces are themed**, not left to defaults: selection, caret, scrollbars, focus rings,
and underline offset all derive from this palette.

## Do's and Don'ts

- **Do** print an aggregate's addends beneath it, permanently. `352` carries `151 base + 201
  bonus`; a parent's individual affinity carries its four link values.
- **Do** render any screen that shows derived data from the derivation itself, including
  throwaway previews. A hand-typed table drifts from the engine within one edit and will state
  things that are not true.
- **Do** omit a row that is always 100%. A guaranteed value is not information.
- **Do** keep star figures as lineage totals, never a maximum across carriers. That total is the
  unit the borrow search filters on, so the two must agree.
- **Don't** fill anything with a spark colour. Ticks and bars only.
- **Don't** give a control a spark colour, or a datum a control's colour.
- **Don't** show a number without somewhere for it to open. If it cannot open, say why in place
  rather than leaving the drawer empty.
- **Don't** use a card for anything that is not a tree node.
- **Don't** add a second accent. Amber means added; that is the whole accent budget.

## Motion

- **Approach:** minimal-functional. Numbers never animate.
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`.
- **Duration:** micro 50-100ms, short 150-250ms. Nothing longer exists in this product.
- **The one authored moment:** a node's spark detail expanding. Height and opacity, 200ms
  ease-out, from an already-visible resting state. Content never hides behind animation timing.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-14 | Dark ground | Builder's call, against the recommendation of both outside voices and this reviewer, all of whom argued light from the use scene. |
| 2026-09-14 | No display typeface | The first proposal used Zen Old Mincho; the builder read it as trying too hard. A tool does not need a display voice, so the headline uses the number face. |
| 2026-09-14 | Interface has no brand colour | Every hue belongs to the game's data. Directly answers the incumbent, whose controls and data share five saturated colours. |
| 2026-09-14 | Affinity kept off the spark colour axis | Proposed independently by both outside voices. Base is ink, individual is muted ink, bonus is the one accent. |
| 2026-09-15 | Tree nodes are cards | Builder's call, reversing "ruled blocks, not cards". A node is a discrete entity and seven explicit connectors carry the layout, so the card earns itself. |
| 2026-09-15 | Portrait moved to the card's top-right, 48px | Builder's call; larger and beside the name rather than above it. |
| 2026-09-15 | Unresolved state moved from amber to red | Amber was already the bonus accent, so both would have been indistinguishable inside the data surface. |
| 2026-09-15 | Star figures are lineage totals, not per-carrier maxima | The maximum carried no meaning and disagreed with the borrow search's filter unit. |
| 2026-09-15 | Wide content scrolls in its own region, never the page body | Found at 390px: the seven-column audit trail pushed the whole document to 487px. The tree already had a region; the table did not. |
| 2026-09-15 | An absent link's edge label is one faint `0`, not `0 +0` | Amber means added, and nothing is added across an empty slot. The connector is dashed for the same reason: absent is a fact and reads calm. |
| 2026-09-15 | Portraits key on card_id, not chara_id | A card is a costume and a costume carries its own unique skill, which is the green spark printed under the portrait. Builder caught the base costume's face rendering above the alternate costume's spark. |
| 2026-09-15 | Portraits are cached locally, never committed | Builder's call. The art is Cygames' and gametora rehosts rather than owns it, so a repo bound for public hosting should not carry it. The initials disc was already designed, so the no-image state costs nothing. |
