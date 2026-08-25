# Public site visual improvements — mozok.tilo.ruh

Date: 2026-08-25  
Target: `/` landing (`index.html`)  
Status: design proposal (Superdesign canvas blocked until CLI login)

## Product

Kyiv conscious-movement studio. Single-page Ukrainian landing: hero → practices → live calendar → values → quotes → testimonials → pricing → signup modal (name + Instagram/Telegram). Brand: cream paper, espresso brown, olive, photography, Montserrat + Space Grotesk, circular logo mark.

## What is already strong

- Distinct voice (not a generic dance school)
- Photo hero with rotating phrase
- Live calendar with bank / type filters
- Values accordion + testimonial carousel
- Clear two-product pricing

## Gaps to improve (UX, not a rebrand)

1. **Desktop nav has no in-page links** — only wordmark + Instagram. After the hero, visitors cannot jump to Практики / Розклад / Ціни without scrolling or opening mobile menu.
2. **Hero CTA cluster is noisy** — one primary + three ghost buttons compete; primary conversion is diluted.
3. **No sticky path to signup after scroll** — Записатись disappears until pricing or mobile drawer.
4. **Signup modal does not capture intent** — no practice type, bank, or “first visit” note, so the studio replies blindly.
5. **Footer is a stub** — copyright + Instagram only; no address/banks, no links, no contact.
6. **Trust is late** — testimonials and “you will not be broken” sit after a long scroll; hero has no social proof.
7. **Teachers and places are invisible** on the public site (they exist in admin).
8. **Calendar contrast** — dark glass widget on cream feels like a leftover from when it lived in the hero.

## Approaches

### A — Keep the brand, fix the landing (recommended)

Same cream / olive / brown / photography. Change structure and conversion, not personality.

- Desktop: logo | Практики, Розклад, Відгуки, Ціни | Instagram + Записатись
- Hero: one primary Записатись + one secondary До розкладу; drop extra ghost buttons
- After ~hero: thin sticky bar on desktop with Записатись
- Modal: optional «Напрям» (Тренаж / Сучасний танець / ще не знаю) and «Берег»
- Footer: wordmark, section links, Instagram, Київ · правий/лівий берег
- Small trust line under hero title (e.g. відгуки + «без вікових обмежень»)
- Calendar: keep embedded, restyle to cream/olive so it matches the section (not dark-on-cream)

### B — Editorial studio

Same tokens, more editorial layout: larger type, full-bleed practice photography, a «педагоги» strip (portraits + one-line bios), richer quotes, cinematic spacing. Higher production; needs real teacher photos.

### C — Short conversion page

Collapse values/quotes; pull pricing and calendar up; big social proof in the hero. Faster signup, weaker brand story.

**Recommendation:** ship **A** as the primary redesign. Explore **B** as the second Superdesign branch. Do not implement C unless conversion is the only goal.

## Scope for Superdesign (when CLI is authenticated)

SOP: existing UI.

1. Pixel-perfect reproduction of current `/`
2. Branch 1 = Approach A (IA + conversion, same design system)
3. Branch 2 = Approach B (editorial, same tokens)

Do not implement production HTML/CSS until a canvas direction is chosen.

## Out of scope

Admin pages, Telegram, pricing math, new practice types, invented photos of staff.

## Success

Visitor can reach schedule and signup in one click from anywhere; modal includes intent; brand still reads as mozok.tilo.ruh (logo, olive, cream, Ukrainian copy).
