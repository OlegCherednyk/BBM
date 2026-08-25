# Design system — mozok.tilo.ruh

## Product context
**mozok.tilo.ruh** is a Kyiv studio for conscious movement: not a typical dance school. Public site is a single-page Ukrainian landing that converts Instagram/Telegram visitors into signup leads. Two practices: **Тренаж** (1h, 500 / 8× 2600 грн) and **Сучасний танець** (1.5h, 600 / 8× 3200 грн). Schedule is a live calendar (Supabase) filterable by Dnipro bank (left/right) and lesson type. Admin is a separate cream/olive CRUD app (lessons, students, abonements) — out of scope unless asked.

**JTBD (visitor):** understand the philosophy, pick a practice, see when/where, trust via values + testimonials, send name + @handle.

**Key pages:** `/` landing only for this redesign. Modal «Почнемо разом» is the conversion surface.

## Branding & styling
- Warm cream paper (`#fff2ec` / `#f1e6dd`) + espresso brown (`#45301d`) + olive (`#74862f`)
- Photography-first: full-bleed hero + card photos; grain overlay; dark vignette
- Type: Montserrat airy/light for headlines (lowercase, wide tracking); Space Grotesk for wordmark and prices
- Pill CTAs; 18px cards; olive uppercase labels
- Glassmorphism on Values + Quotes over a fixed studio photo background
- Motion: slow reveals, rotating hero phrase, testimonial stack carousel
- Tone: calm, body-aware, non-hustle; Ukrainian copy; no «hip-hop/contemporary studio» clichés

## Motion patterns
Reveal on scroll; hero title blur-in; rotating words; accordion expand; testimonial crossfade; CTA shimmer; calendar selection olive fill. Honor `prefers-reduced-motion`.

## Specific constraints
- Language: Ukrainian
- Logo: circular `logo_bbm_circle.png` + wordmark; never replace with initials
- Keep olive/cream/brown identity unless exploring a stated variation that still uses these tokens
- Primary conversion: Записатись → modal (name + Instagram/Telegram)
- Desktop nav currently has NO in-page links (only logo + IG); links live in mobile drawer and hero ghost buttons
- Do not invent extra practice types or prices
