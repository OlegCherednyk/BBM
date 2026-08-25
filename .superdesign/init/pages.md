# Pages — component dependency trees

## / (Home — public landing)
Entry: `index.html`
Dependencies:
- `assets/css/styles.css`
- `assets/css/testimonials.css`
- `logo_bbm_circle.png` (nav mark / favicon)
- `assets/images/hero-background.png` (hero + `.site-bg`)
- `assets/images/hero-background-mobile.png` (JS may swap)
- `assets/images/trenazh-card.png`
- `assets/images/suchasnyi-tanets-card.png`
- `assets/js/custom-select.js`
- `assets/js/testimonials.js`
- `assets/js/script.js`
  - `assets/js/runtime-supabase-config.js`
- Inline: nav, mobile-nav, hero, spotlight cards, schedule calendar, values accordion, quotes slider, testimonials carousel, pricing cards, signup `<dialog>`, footer, toast, scroll-top

## /admin/ (login)
Entry: `admin/index.html`
Dependencies:
- `assets/css/styles.css`
- `assets/css/admin.css`
- `assets/js/custom-select.js`
- `assets/js/admin.js`

## /admin/lessons.html (representative admin)
Entry: `admin/lessons.html`
Dependencies:
- `assets/css/styles.css`
- `assets/css/admin.css`
- `logo_bbm_circle.png`
- `assets/js/custom-select.js`
- `assets/js/admin.js`
- Shared admin nav markup (drawer + jumps populated by JS)

Skip: 404, offline (none).
