# Salsa Barber: design brief

## Mood

**Dark, editorial, premium.** Redesigned in November 2026 (replacing the earlier cream "shop-front sticker" look).
Built from the shop's own sign: **near-black, warm white and Salsa yellow**. The barber-pole red/blue appear only in the logo.

**Adjectives:** sleek · confident · modern

## Layout concept

- **Full-bleed hero frame.** The shop photo fills a large rounded panel under a dark gradient. The panel is a `.dark` island, so it
  looks the same in both themes. Huge "Salsa *Barber*" headline (Archivo, expanded; "Barber" in yellow Instrument Serif italic),
  live open-status pill, yellow Book button with a soft glow, glass Call button, glass chips for area and Google rating.
  No photo: the badge logo glows on a dot grid instead. A slow, decorative **services ticker** runs under the hero.
- **Section headings:** a small uppercase eyebrow with a yellow dot, then a big heading whose last word is set in the italic serif.
- **Services:** heading with a Book button, then a grid of cards (1 / 2 / 3 columns): name and big price, length and
  bookable-days chips, and a "Book this" arrow that fills yellow on hover. Tapping a card starts booking that service.
- **Recent cuts:** mosaic grid (first photo large, second wide on desktop) with a lightbox.
- **Inside the shop:** compact centred carousel (max 56rem) with the neighbouring photos peeking in, progress pills and
  prev / pause / next under it.
- **Team:** portrait cards (photo or glowing initials) with the name over a gradient and a "Book with" pill.
- **Reviews:** big rating number beside the heading; quote cards with soft shadows.
- **Visit:** bento of cards: hours, address and contact, map.
- **Footer:** always-dark rounded panel: "Ready for a *fresh cut?*", details, and a giant outlined "Salsa" wordmark.
- **Header:** sticky frosted glass; on desktop the section links sit in a centred pill.
- **Motion:** sections slide up as they scroll into view (CSS scroll-driven animations, no JavaScript), image zoom on hover,
  ticker. All of it is off with `prefers-reduced-motion`.
- Pill-shaped buttons; large-radius cards.

## Phone vs desktop

| | Phone (390px, checked 320–430) | Tablet (768) | Desktop (1280+) |
| --- | --- | --- | --- |
| Header | Logo + name, theme toggle, menu button; full-screen dark menu with numbered links | Same, with Call | Centred link pill, Call, Book |
| Hero | Tall photo panel, headline, Book + Call | + Pay / walk-in glass card | Headline left, glass info card right |
| Book | Floating glass pill bar (hidden while the hero Book is visible) | Same | Header button only |
| Services | Heading, then list | Same | Sticky intro + list in two columns |
| Gallery | 2 columns, first photo full width | Same | Mosaic, 4 columns |
| Visit | Stacked cards | Two columns | Hours, address, map |

## Design tokens

All colours live in `src/app/globals.css` as CSS variables mapped to shadcn tokens, light in `:root` and dark in `.dark`.
`tests/unit/theme-contrast.test.ts` parses the file and checks WCAG 2.1 AA (4.5:1 text, 3:1 UI boundaries) for every pair.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#f7f6f2` warm white | `#0a0a0b` near-black | Page |
| `--foreground` | `#0e0e10` ink | `#f5f3ee` warm white | Text |
| `--card` | `#ffffff` | `#141416` | Cards, inputs |
| `--muted` / `--muted-foreground` | `#eeece6` / `#57534e` | `#1d1d20` / `#a8a49c` | Quiet surfaces, secondary text |
| `--primary` | `#ffc20e` Salsa yellow | `#ffc20e` | Book buttons, highlights (ink text) |
| `--secondary` | `#0e0e10` ink | `#f5f3ee` | Inverted buttons |
| `--accent` | `#c8102e` red | `#ff5d6c` | Small accents, chips |
| `--destructive` | `#b42318` | `#ff7a6b` | Cancel, delete, errors |
| `--link` | `#8a5a00` amber | `#ffd24d` yellow | Text links |
| `--ring` | `#0b63c4` | `#5aaeff` | Focus outline (3px) |
| `--input` | `#8a857c` | `#77746e` | Input borders (3:1) |
| `--border` | `#e4e1d9` | `#2a2a2e` | Decorative dividers |
| `--brand-red` / `--brand-blue` | `#d7263d` / `#0b7bd6` | `#ff5d6c` / `#4ba3ff` | Barber-pole stripe only |
| `--shadow-hard` | ink | warm white | Strong outlines |
| `--glow` | yellow | yellow | Soft glow under the Book button, glow spots |

**Booking status colours** (chip background / text; both themes pass AA):

| Status | Light | Dark |
| --- | --- | --- |
| Request (pending) | `#fff0bf` / `#6b4300` | `#3b2c05` / `#ffd966` |
| Confirmed | `#dcebff` / `#0a4a8f` | `#0e2945` / `#9ccbff` |
| Done | `#dcf2e3` / `#12602f` | `#0e3220` / `#8ee3aa` |
| No-show | `#fde1e4` / `#9b1426` | `#44131a` / `#ffa3ad` |
| Cancelled / declined | `#ece6dd` / `#4f4840` | `#2a2622` / `#c4baae` |

Status is never shown by colour alone: chips always carry a word, and cards have a coloured left edge plus the label.

## Typography

Self-hosted via `next/font` (no layout shift).

- **Display / headings:** Archivo (variable), weight 800, set at 112% width, very tight tracking, sentence case.
- **Accent:** Instrument Serif *italic*, one word per heading (`.serif-accent`), often in yellow on dark.
- **Body / UI:** Geist, 400–600 (the header name is one font, Archivo, with no serif accent).
- **Prices:** `.price` class = Geist 700 with `tabular-nums lining-nums`, so prices line up.

| Token | Size (phone → desktop) | Line height |
| --- | --- | --- |
| `text-display` | 56px → 160px (fluid) | 0.86 |
| `text-h1` | 40px → 72px | 0.98 |
| `text-h2` | 34px → 64px | 1 |
| `text-h3` | 20px → 24px | 1.2 |
| `text-lead` | 17px → 20px | 1.55 |
| `text-body` | 16px | 1.6 |
| `text-label` | 13px, +0.02em, often uppercase with wide tracking | 1.3 |
| `text-price` | 18px → 22px | 1 |

Inputs are always 16px so iPhones don't zoom.

## Theming

- Public site and dashboard keep **separate** preferences (`salsa-site-theme`, `salsa-dashboard-theme` in localStorage).
- Public default theme for new visitors comes from Settings (phase 2); until then `site.defaultPublicTheme` = **dark**
  (matches the shop's black-and-yellow signage). A visitor's toggle wins.
- Dashboard: Light / Dark / System (default System).
- A tiny inline script in `<head>` sets `.dark`, `color-scheme` and the `theme-color` meta before paint (no flash).
- `/book`: recommend **following the site theme** (both themes pass AA and the yellow/ink buttons read clearly in either).
  Decide during phase 6 once real flows exist.

## Component sketches

> The homepage sketches below are from the original poster design; see *Layout concept* above for the current design.

### Homepage, phone (390px)

```
┌──────────────────────────────┐
│ Salsa Barber        ☀  ☰     │  header = page bg, sticky
├──────────────────────────────┤
│ BARBERS IN MAGHULL           │  small label
│ Salsa                        │
│ ▓Barber▓                     │  display, marker swipe
│ ● Open now · closes 6pm      │  live status
│ [■ Book a cut ■]  (Call)     │  pop button + outline
│   ┌────────────────────┐ ◉   │  tilted landscape photo
│   │   shop photo       │OPEN │  + sticker
│   └────────────────────┘     │
│ ★ 4.9 on Google (123)        │  if set
│ ╱╲╱╲ pole stripe ╱╲╱╲         │
│ Services & prices            │
│ Hair cut ........... £17     │
│ 30 min                       │
│ Skin fade .......... £18     │
│ …                            │
│ Recent cuts  ◀ [ ][ ][ ] ▶    │
│ …                            │
├──────────────────────────────┤
│ [■ Book ■]        (📞 Call)  │  sticky bar (hidden while hero Book visible)
└──────────────────────────────┘
```

### Homepage, tablet (768px)

```
┌──────────────────────────────────────────────┐
│ Salsa Barber                Call   ☀   ☰      │
│ BARBERS IN MAGHULL                            │
│ Salsa ▓Barber▓            [■ Book ■] (Call)   │
│ ┌──────────────────────────────────────┐ ◉    │
│ │ shop photo, wide                     │      │
│ └──────────────────────────────────────┘      │
│ Services                                      │
│ Hair cut ...... £17   │ Beard trim .... £14   │
│ Skin fade ..... £18   │ Wet shave ..... £16   │
└──────────────────────────────────────────────┘
```

### Homepage, desktop (1280px+)

```
┌──────────────────────────────────────────────────────────────────┐
│ Salsa Barber    Services  Cuts  Team  Reviews  Visit   Call ☀ [■Book■] │
├──────────────────────────────────────────────────────────────────┤
│ BARBERS IN MAGHULL                 ██████████                     │
│ Salsa                            ┌─██────────────┐ ◉ OPEN         │
│ ▓Barber▓                         │  shop photo   │                │
│ ● Open now · closes 6pm          └───────────────┘                │
│ [■ Book a cut ■]  (Call)                                          │
├─╱╲╱╲╱╲──────────────────────────────────────────────────────────┤
│ Services & prices                       │  Discount / walk-in note │
│ Hair cut ...... £17 │ Beard trim .. £14 │                          │
│ …                   │ …                 │                          │
│ Visit:  Hours │ Address, call, socials │ [map preview: Show map]  │
└──────────────────────────────────────────────────────────────────┘
```

### Booking flow (`/book`)

```
┌──────────────────────────────┐
│ ← Back        Step 2 of 4    │
│ ▬▬▬▬▬▬▬▬░░░░░░░ (pole stripe) │  progress
│ Who would you like?          │  heading gets focus
│ ┌──────────────────────────┐ │
│ │ ◎ Any barber             │ │  big tap rows
│ │ (A) Ahmed                │ │
│ │ (S) Sam                  │ │
│ └──────────────────────────┘ │
│ Summary: Hair cut · £17 Change│
└──────────────────────────────┘
Date step: swipeable day strip  [Mon 9][Tue 10][Wed 11]…  (disabled = no times)
Times:     Morning  [9:00am][9:15am]…   Afternoon […]   Evening […]
Details:   Name [        ]  Mobile [        ]  [■ Send request ■]
Sent:      "Request sent, not confirmed until the shop replies" + details + address
```

On desktop the flow sits in a centred 640px column with the summary as a sticky side card.

### Dashboard shell

```
Phone                               Desktop
┌──────────────────────────┐       ┌────────┬──────────────────────────────┐
│ Hi Sam · Owner   🔔3 ☀ ⎋ │       │ Salsa  │ Today, Thu 12 Nov    🔔3 ☀ ⎋ │
├──────────────────────────┤       │        ├──────────────────────────────┤
│ [Walk-in] [Booking]      │       │ Today  │ [Walk-in] [Booking]          │
│ 6 today · £94 · 3 next   │       │ Calendar│ Requests (2)   │ Next up     │
│ Requests (2)             │       │ Clients│ ┃10:15 Jo · Cut │ Now: Ali   │
│ ┃10:15 Jo · Cut  [Accept]│       │ Team   │ Needs closing  │ Schedule   │
│ Needs closing            │       │ More   │ …              │ ─now──     │
│ …                        │       │        │                │            │
├──────────────────────────┤       └────────┴──────────────────────────────┘
│ Today Calendar Clients Team More │  bottom tabs (safe-area aware)
└──────────────────────────┘
```

Dashboard surfaces stay neutral (white/cream or warm dark). Yellow is used only for the primary action and the
active tab indicator; status colours carry the meaning.
