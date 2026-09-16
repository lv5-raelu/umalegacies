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

**Two layouts, and which one applies is decided by what the surface is for.**

**Reading a result: single column, max 900px, centred.** Content-driven widths, never
full-bleed by habit. The lineage tree, the audit trail and every provenance panel live here.
Nothing about reading one answer wants more width than a line of prose.

**Comparing candidates: two panes, max 1400px.** A scrolling list on the left at
`minmax(0, 1fr)`, a sticky compare pane on the right at a fixed 380px, 32px between them.
This is the roster screen and it is the only surface that earns it. The justification is that
comparing is the job: the user is choosing between 259 veterans and the number they are
choosing *against* has to stay on screen while the list moves under it. A single column would
put the pair total above the fold at first and nowhere at all by row 40, which turns a
comparison into a memory test.

**Below 900px the panes collapse to one column** and the compare pane becomes a button
through to its own page. There is no two-pane phone layout; 380px of pane against a 390px
viewport is not a layout.

**The tree is never a pane.** It needs 848px at its designed size, and a 380px pane forces
120px cards, which cannot hold a 17-character name plus four spark lines. It keeps its own
page at full single-column width, reached by a button from the compare pane. The tree is
provenance; the pane is a decision surface; they are different jobs and the tree loses the
fight for horizontal space every time.

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

**The page body never scrolls horizontally, and neither does the tree.** Four 200px node cards
and three 16px gaps come to 848px, inside the 868px content column, so the pedigree fits the page
at the width it is read at. Below that the cards shrink with the grid and the portrait shrinks
with them, giving up furniture before text. The audit trail needs ~560px and keeps its own
`overflow-x: auto` region, because every column of it is part of the audit. A scroll container
remains under the tree as a floor for viewports no pedigree can serve; a pedigree whose tiers
stack is no longer a pedigree.

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

**card** — a card is a discrete entity you can point at: a tree node, and a veteran in the
roster. The border is what makes it read as one. Surface `#1B1D23` on paper `#121317` separates at
1.10:1, so the 1px `rule` border is load-bearing, not decorative. The trainee card takes
`rule-strong`. Nothing else in the product is a card: the table is a table, panels are ruled
regions. The veteran card is the same object one step earlier -- pick it and it becomes a
parent node in the tree -- so the two surfaces agree about what a card means.

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

**drop zone** — the first-run surface and the only thing on screen before a save is loaded.
A ruled region, not a card: 2px dashed `rule`, `radius-md`, centred in the single column,
with `surface` as its ground so it separates from paper. It holds exactly two lines. The first
says what to load. The second says the file never leaves the machine, and it is placed *here*,
at the moment of decision, because that is where the claim is earned and a footer is not. On
drag-over the border goes solid `primary` and the ground lifts one step; nothing else moves,
and the zone never changes size. While parsing it keeps its exact shape and swaps its second
line for progress. On success it collapses to a one-line file summary (name, veteran count)
with a control to replace it. On failure the error is named inside the zone and the zone stays
usable, because the next thing the user does is pick a different file.

**veteran card** — one card per veteran in the roster list, stacked with a 12px gap. It
carries the portrait of the exact costume at 44px, the name with its costume tag, the package
line (`out of A x B`), the score, then two ruled bands: the three named sparks at their fixed
column widths, and **every white spark named**. Whites wrap rather than stacking, because a
veteran carries 12-19 of them and one per line would make a 400px card out of a 120px one, 259
times over. A count alone (`+7 whites`) is not enough: it says how many there are and nothing
about whether one of them is the one you want, which is the only question a white answers.

The card leads on portrait, score and sparks rather than on the name because **names cannot
identify these rows** — 255 of 259 veterans share a character name with another and only 29
distinct names exist across the roster. The veteran plus its own two parents is 166-distinct
and is the real unit of choice.

Selected cards take an `ink` border and an A/B mark, never a fill. **Selecting never moves a
card**: the list holds still so the card under the cursor stays there. When two are already
picked, the rest go to `.locked` — dimmed and `aria-disabled`, still readable and still
focusable, because a card is information whether or not it can be selected right now. A third
click does nothing; swapping a parent means unselecting one first.

**filter region** — a ruled region directly above the list, never floating and never a modal,
because the result of a filter is the list and the two must be readable together. One criterion
row: spark, comparator, star threshold, plus a scope selector. Controls are achromatic like every
other control; the only colour in the region is the tick on a chosen spark, which is a datum. The
region states its own result (`31 of 259`) and carries a clear action whenever it is narrowing
anything. It sits below the trainee picker, not above it, because the working set changes with the
trainee: measured on the roster, any two trainees' parent sets overlap only 48%.

**Loading and empty, as a general rule.** A surface that is waiting keeps its own shape and says
what it is waiting for. A surface that has nothing to show yet is **absent**, not empty and not
disabled: before a save is parsed there is no picker and no list on the page at all, because a
disabled control for data that does not exist yet invites a click that can never work. A surface
that has nothing to show *after* filtering says so in place, names the filter that emptied it, and
offers to clear it. These are three different states and they never share a treatment.

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
- **Don't** use a card for anything that is not a discrete entity you pick or inspect. A
  table is a table, a panel is a ruled region.
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
| 2026-09-15 | The tree fits the column instead of scrolling | Builder's call: a sideways scrollbar under the decision surface is annoying. It only ever overflowed by 44px, because the card max-width asked for 912px against an 868px column. |
| 2026-09-15 | Portraits key on card_id, not chara_id | A card is a costume and a costume carries its own unique skill, which is the green spark printed under the portrait. Builder caught the base costume's face rendering above the alternate costume's spark. |
| 2026-09-15 | Portraits are cached locally, never committed | Builder's call. The art is Cygames' and gametora rehosts rather than owns it, so a repo bound for public hosting should not carry it. The initials disc was already designed, so the no-image state costs nothing. |
| 2026-09-16 | Two panes on the roster screen, amending the single-column rule | Comparing is the job. The number being chosen against must stay on screen while 259 rows move under it; a single column puts it above the fold at first and nowhere by row 40. Scoped to that one surface. |
| 2026-09-16 | The veteran row leads with score and sparks, not the name | Measured on the real roster: 255 of 259 veterans share a character name, 29 distinct names total, one character appears 54 times. A name-led list is unreadable. The veteran plus its own two parents is 166-distinct. |
| 2026-09-16 | The tree keeps its own page and is never a pane | It needs 848px. A 380px pane forces 120px cards, which cannot hold a name plus four spark lines. Provenance and comparison are different jobs. |
| 2026-09-16 | Before a save is parsed, surfaces are absent rather than disabled | A disabled control for data that does not exist yet invites a click that can never work. Absent, empty-after-filter and loading are three states with three treatments. |
| 2026-09-16 | The local-only claim lives inside the drop zone | It is placed at the moment of decision rather than in a footer, because that is where it is being relied on. |
| 2026-09-16 | Veterans are cards, reversing "dense-list row" | Builder's call. A veteran is a discrete entity with a portrait, a score and up to 22 sparks, and it is literally the thing that becomes a tree node once picked. The ruled row could not hold the full white list or a portrait. |
| 2026-09-16 | Every white spark is named on the card | Builder's call. `+7 whites` answers "how many", and the only question a white spark raises is "is the one I want in there". |
| 2026-09-16 | Selecting never reorders the list, and never evicts a pick | Builder's call. Pinning picks to the top made the list jump under the pointer; auto-replacing the older pick guessed invisibly at which one the user meant to keep. Swapping is now two deliberate steps. |
| 2026-09-16 | The two parents cannot be the same uma | Game rule, named by the builder. Compared by `chara_id`, never `card_id`: two costumes of one character are still one character, and card equality would wave the pair through on a costume change. A blocked card dims and states the reason in place rather than ignoring the click. |
| 2026-09-16 | A parent cannot be the trainee, and the trainee is chosen first | Game rule, named by the builder. The roster is absent until a trainee is picked rather than shown and inert, because who you are training decides which veterans are legal parents — showing 259 cards first means showing cards about to become unpickable. No placeholder text stands in for it: an empty space under an unused picker says what it needs to. Narrow rule: it bars the PARENT slot only. The trainee's character may still appear as a grandparent, which the engine models deliberately (fixture 5774). |
