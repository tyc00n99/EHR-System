# EVVora design system (October 18, 2026)

> **Not in use (Oct 18, 2026).** The user had this redesign reverted the day it shipped; the app is back on its pre-redesign look. Kept for reference only.

Derived from the user's two reference screenshots (a caregiver "Today" phone screen and a
"Schedule" phone screen), with two of their notes applied: **"too much blue"** and **"I don't want
two background colors"**. Every value below is a token in `src/app/globals.css` (the final
"Calm redesign" block); components use the Tailwind names, never raw hex.

## Colour

> **Reverted Oct 18, 2026 (user: "take it back how it was").** The colour table below is no longer
> applied: the app is back on its pre-redesign palette (Passage blue `#0098c0` primary, one ink for
> text). `--brand`/`--brand-ink` now point at `--primary`. Shape, spacing and layout below still hold.

| Role | Token / class | Value |
| --- | --- | --- |
| Page and cards (one background) | `bg-page`, `bg-card` | `#ffffff` |
| Card edge | `border-line` + `shadow-[var(--shadow-sm)]` | `#e4e7ee`, 1px 2px 4% |
| Hairline inside a card | `divide-line-soft` / `border-line-soft` | `#eceff4` |
| Ink: primary buttons, selected chip/day, hub | `bg-primary` / `text-primary-foreground` | `#2f3a4f` / white |
| Soft: secondary buttons, hover, active tab fill | `bg-primary-soft`, `bg-tab-hover` | `#eef0f5` |
| Text / headings / secondary | `text-text`, `text-text-strong`, `text-muted-foreground` | `#2b3241`, `#232a3a`, `#6b7183` |
| Brand blue (accents) | `bg-brand`, `border-brand`, `ring`; text `text-brand-ink` | `#0098c0` (fills), `#00708e` (text, small icons) — current tab, selected day, eyebrows, phone tab, focus, "in progress" |
| Status | `ok` / `warn` / `danger` (+ `-soft`) | green `#2f7a4a`, amber `#a2620c` on `#fcefe0`, rose `#c0394f` on `#fbe8ec` |

No large surface takes a fill other than white. `bg-panel` / `bg-card-soft` are for small chips only.

## Type

Geist, one face. Page title `h1` 28/34 weight 600, tracking −0.022em. A grey context line sits
above it ("Sun, Oct 18 · 3 visits today"). Row titles 15px medium; row subtitles 13px muted;
group labels 13px medium muted ("Now", "Later today"). Eyebrows (`Eyebrow`) 13px uppercase
tracked ("NEXT VISIT · 10:00 AM"). The 13px floor from September stands.

## Shape

Cards 16px (`--radius`), inputs 10px (`--radius-field`), buttons and chips full pills
(`--radius-btn`). Buttons are 36px (`h-9`); a hero action is `h-11`.

## Components (`src/components/kit.tsx`)

- `Button` / `LinkButton`: `primary` (ink), `secondary` (soft), `outline`, `ghost`, `danger`.
- `Card`, `StatTile`, `Kpi`: white, bordered, 16px.
- `Badge tone dot`: status pill with a leading dot — `<Badge tone="ok" dot>Live</Badge>`.
- `GroupLabel` + `ListGroup` + `ListRow`: the reference's grouped list (lead avatar/icon, title
  over a muted line, trailing pill and chevron). Use these rather than hand-rolling lists.
- `ChipLink` (links) / `FilterChips` (client state): bordered white pills, the chosen one solid ink,
  counts inline.
- `Eyebrow`: the small uppercase label on hero cards.

## Navigation

- Desktop and tablet: the corner hub (unchanged behaviour) and the Messages pill.
- Phones (below `md`): `PhoneTabBar` in `corner-hub.tsx` — a floating white pill of up to four
  tabs, the current one filled soft, plus a round Messages button with the unread count. A role
  with more than four areas gets "More", which opens the hub's fan.

## Screens rebuilt on it

- Caregiver Today (`(app)/page.tsx`): greeting, hero card (visit in progress / next visit /
  clock), week chips, "Later today" and "Done" lists, needs-action, messages, period tiles.
- Schedule on phones (`scheduling/agenda.tsx`): one day, All / Needs cover / Late / Live chips,
  "Now" then by start time; the desktop grid is unchanged above `md`.

Blue accents were the user's pick (Oct 18): blue marks where you are and what is selected; buttons stay ink. Never put #0098c0 behind or under small text — use `brand-ink`.
