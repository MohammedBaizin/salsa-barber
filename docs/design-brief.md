# Salsa Barber: design brief

## Mood

A neighbourhood shop with a loud, happy sign: the **"shop-front sticker"** look.
Warm cream paper (or warm near-black at night), heavy friendly type, one punchy yellow, and the red/white/blue of the
barber pole as small accents only.

**Adjectives:** bold · warm · playful-sharp

Brand source: the owner's two logos (`assets/logo-original.png` round badge, `assets/wordmark-original.png` wordmark)
and price list, which use **yellow**, **red**, **barber-pole blue** and **cream** on black.

## Layout concept

- **Poster-style hero.** Big sentence-case headline in Bricolage Grotesque, one word on a yellow **marker swipe**,
  a "pop" Book button (yellow, ink outline, hard offset shadow that presses in on tap). On phones the shop photo sits
  below as a wide landscape card with a slight tilt and an "Open now" **sticker** pinned to its corner. On desktop the
  hero splits into two columns, photo on the right overlapping a yellow block. When there's no photo, the badge logo
  takes the photo's place on an ink disc.
- **Barber-pole stripe.** A thin diagonal red/cream/blue band, used as dividers between sections and as the slideshow
  progress track. Never large.
- **Menu-board services.** A price list with dotted leaders and tabular prices. One column on phones, two columns on
  desktop, with duration underneath each name. Tapping a row starts booking that service.
- **Cards with stickers.** Gallery, team and review cards are flat with a 1px border; one sticker-style chip per card
  (e.g. "Book with Sam").
- **Section order** (proposed, decided in phase 5): Hero → Services & prices → Recent cuts → Slideshow ("Inside the shop") → Team → Reviews → Visit.
  Headings are sentence case, never condensed or all caps.

### What we deliberately avoid (§3)

No gold/ink scheme, no gold header or footer (the header is the page background), no condensed uppercase sign
headings or script wordmark pairing, no tall rounded photo frame with text on a dark fade, no scrolling marquee.

## Phone vs desktop

| | Phone (390px, checked 320–430) | Tablet (768) | Desktop (1280+) |
| --- | --- | --- | --- |
| Header | Name + theme toggle + menu button; full-screen menu | Same, with Call | Inline nav, Call, pop Book button |
| Hero | Stacked: label, headline, buttons, tilted photo card | Stacked, wider photo | Two columns, photo overlaps a yellow block |
| Book | Sticky bottom bar (hidden while the hero button is visible) | Sticky bar | Header button only |
| Services | Single list | Two columns | Two columns + side note (discount, walk-in text) |
| Gallery | Swipe row, 3 max | 3 across | 3 across, larger |
| Visit | Stacked: hours, address, map card | Two columns | Three columns: hours · address/contact · map |

## Design tokens

All colours live in `src/app/globals.css` as CSS variables mapped to shadcn tokens, light in `:root` and dark in `.dark`.
`tests/unit/theme-contrast.test.ts` parses the file and checks WCAG 2.1 AA (4.5:1 text, 3:1 UI boundaries) for every pair.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#fbf6ee` cream | `#141210` warm black | Page |
| `--foreground` | `#1c1917` ink | `#f6efe4` cream | Text |
| `--card` | `#ffffff` | `#1f1c19` | Cards, inputs |
| `--muted` / `--muted-foreground` | `#f1e9dc` / `#5b5249` | `#2a2622` / `#bcb2a5` | Quiet surfaces, secondary text |
| `--primary` | `#ffc20e` Salsa yellow | `#ffc20e` | Book buttons, highlights (ink text) |
| `--secondary` | `#1c1917` ink | `#f6efe4` cream | Inverted buttons |
| `--accent` | `#c8102e` red | `#ff5d6c` | Small accents, chips |
| `--destructive` | `#b42318` | `#ff7a6b` | Cancel, delete, errors |
| `--link` | `#0b5cb5` | `#7cbcff` | Text links |
| `--ring` | `#0b63c4` | `#5aaeff` | Focus outline (3px) |
| `--input` | `#8a7e70` | `#8a7f73` | Input borders (3:1) |
| `--border` | `#e2d6c4` | `#39332d` | Decorative dividers |
| `--brand-red` / `--brand-blue` | `#d7263d` / `#0b7bd6` | `#ff5d6c` / `#4ba3ff` | Barber-pole stripe only |
| `--shadow-hard` | ink | cream | "Pop" button outline + offset shadow |

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

- **Display / headings:** Bricolage Grotesque (variable, optical size axis), weights 700–800, tight tracking, sentence case.
- **Body / UI:** Inter, 400–600.
- **Prices:** `.price` class = Bricolage 700 with `tabular-nums lining-nums`, so prices line up.

| Token | Size (phone → desktop) | Line height |
| --- | --- | --- |
| `text-display` | 44px → 92px (fluid) | 0.95 |
| `text-h1` | 34px → 56px | 1.02 |
| `text-h2` | 28px → 42px | 1.08 |
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
