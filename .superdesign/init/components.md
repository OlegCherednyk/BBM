# Shared UI components (vanilla HTML/CSS)

No React/Vue component library. Shared primitives are CSS class systems in `assets/css/styles.css` and `assets/css/testimonials.css`.

## Button (`.btn`)
- File: `assets/css/styles.css`
- Variants: `--primary` (brown fill), `--ghost` (outline), `--full`, `--large`, `--sm` (admin). Hero overrides invert primary to white fill.
- Key props/classes: `btn btn--primary`, `btn btn--ghost`, `btn--full`

```css
/* ── BUTTONS ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 8px;
  padding: 14px 30px;
  border-radius: 999px;
  border: 2px solid transparent;
  font-size: 1rem; font-weight: 600;
  transition: transform .2s ease, box-shadow .2s ease, background .2s ease, color .2s ease;
  white-space: nowrap;
  text-decoration: none;
}
.btn:hover { transform: translateY(-2px); }
.btn:active { transform: translateY(0); }

.btn--primary {
  background: var(--brown-dark);
  color: var(--white);
  border-color: var(--brown-dark);
  box-shadow: 0 8px 22px rgba(69,48,29,.22);
}
.btn--primary:hover {
  background: #321f0e;
  border-color: #321f0e;
  box-shadow: 0 14px 30px rgba(69,48,29,.28);
}
.btn--ghost {
  background: transparent;
  color: var(--brown-mid);
  border-color: var(--cream-mid);
}
.btn--ghost:hover {
  border-color: var(--brown-mid);
  color: var(--brown-dark);
}
.btn--large { padding: 17px 38px; font-size: 1.05rem; }
.btn--full   { width: 100%; }

```

Hero button overrides:
```css
.hero__actions { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; }

.hero .btn--primary {
  background: rgba(255, 255, 255, 0.95);
  color: var(--brown-dark);
  border-color: transparent;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25);
}
.hero .btn--primary:hover {
  background: #fff;
  border-color: transparent;
  color: var(--brown-dark);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.32);
}
.hero .btn--ghost {
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  border-color: rgba(255, 255, 255, 0.35);
}
.hero .btn--ghost:hover {
  border-color: rgba(255, 255, 255, 0.55);
  color: #fff;
}

```

## Input / Form group
- File: `assets/css/styles.css` (modal + shared native/custom select)

```css
.modal__form { display: flex; flex-direction: column; gap: 18px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: .85rem; font-weight: 600; color: var(--brown-mid); }

.form-group input {
  padding: 13px 16px;
  border: 1.5px solid var(--cream-mid);
  border-radius: var(--radius-sm);
  font-family: var(--ff-body); font-size: .97rem;
  background: var(--cream);
  color: var(--brown-dark);
  outline: none;
  transition: border-color .2s;
}
.form-group input:focus { border-color: var(--brown-mid); }

/* Polished native selects — однаковий стиль з адмін-панеллю */
.form-group select {
  width: 100%;
  min-height: 48px;
  padding: 12px 44px 12px 16px;
  border: 1.5px solid var(--cream-mid);
  border-radius: var(--radius-sm);
  font-family: var(--ff-body); font-size: .97rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--brown-dark);
  background-color: var(--cream);
  background-image: var(--select-chevron);
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 22px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  color-scheme: light;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.75),
    inset 0 -1px 0 rgba(69, 48, 29, 0.06);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}
.form-group select:hover { border-color: var(--brown-light); }
.form-group select:focus {
  border-color: var(--olive);
  background-color: var(--white);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.95),
    0 0 0 3px rgba(116, 134, 47, 0.2);
}
.form-group select:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.form-group select option {
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  background: var(--white);
  color: var(--brown-dark);
}
.form-group select option:checked,
.form-group select option:hover,
.form-group select option:focus-visible {
  background: linear-gradient(180deg, rgba(116, 134, 47, 0.2) 0%, rgba(116, 134, 47, 0.28) 100%) !important;
  color: var(--brown-dark) !important;
  -webkit-text-fill-color: var(--brown-dark);
  box-shadow: 0 0 0 999px rgba(116, 134, 47, 0.22) inset;
}

.form-group input.error { border-color: #c0392b; }
.form-group select.error { border-color: #c0392b; }
.form-error { font-size: .8rem; color: #c0392b; min-height: 1em; }

```

## Custom Select
```css
/* ── CUSTOM SELECT (non-native dropdown) ── */
.custom-select {
  position: relative;
  width: 100%;
}
.custom-select__native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
}
.custom-select__trigger {
  width: 100%;
  min-height: 48px;
  padding: 12px 44px 12px 16px;
  border: 1.5px solid var(--cream-mid);
  border-radius: var(--radius-sm);
  font-family: var(--ff-body);
  font-size: 0.97rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--brown-dark);
  background-color: var(--cream);
  background-image: var(--select-chevron);
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 22px;
  text-align: left;
  outline: none;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.75),
    inset 0 -1px 0 rgba(69, 48, 29, 0.06);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}
.custom-select__trigger:hover { border-color: var(--brown-light); }
.custom-select__trigger:focus-visible,
.custom-select.is-open .custom-select__trigger {
  border-color: var(--olive);
  background-color: var(--white);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.95),
    0 0 0 3px rgba(116, 134, 47, 0.2);
}
.custom-select__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 60;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--cream-mid);
  border-radius: var(--radius-sm);
  background: var(--white);
  box-shadow: 0 12px 28px rgba(69, 48, 29, 0.16);
  padding: 6px;
  display: none;
  flex-direction: column;
  gap: 3px;
  box-sizing: border-box;
}
.custom-select.is-open .custom-select__menu {
  display: flex;
}
.custom-select__option {
  flex: 0 0 auto;
  width: 100%;
  border: none;
  border-radius: 8px;
  padding: 10px 12px;
  font-family: var(--ff-body);
  font-size: 0.94rem;
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
  color: var(--brown-dark);
  background: transparent;
}
.custom-select__option:hover,
.custom-select__option:focus-visible,
.custom-select__option.is-selected {
  background: rgba(116, 134, 47, 0.22);
  outline: none;
}
.custom-select__option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.custom-select.is-disabled .custom-select__trigger {
  opacity: 0.65;
  cursor: not-allowed;
}

```

## Card (generic `.card`)
```css
/* ── CARDS ── */
.directions { background: var(--white); }
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 24px;
  margin-top: 42px;
}
.card {
  background: var(--cream);
  border: 1px solid var(--cream-mid);
  border-radius: var(--radius);
  padding: 32px 28px 28px;
  display: flex; flex-direction: column; gap: 14px;
  transition: transform .25s ease, box-shadow .25s ease, border-color .25s;
}
.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 18px 40px var(--shadow);
  border-color: var(--brown-mid);
}
.card--accent { background: var(--brown-dark); color: var(--white); border-color: transparent; }
.card--accent .card__text { color: rgba(255,242,236,.8); }
.card--accent .card__cta { color: var(--cream); border-color: rgba(255,242,236,.4); }
.card--accent .card__cta:hover { border-color: var(--cream); color: var(--cream); }

.card__icon {
  font-size: 1.5rem;
  color: var(--olive);
  line-height: 1;
}
.card--accent .card__icon { color: var(--cream-soft); }

.card__title {
  font-family: var(--ff-display);
  font-size: 1.3rem; font-weight: 700;
}
.card__text {
  font-size: .95rem; line-height: 1.7;
  color: var(--brown-mid);
  flex: 1;
}
.card__cta {
  align-self: flex-start;
  background: none; border: none; padding: 0;
  font-size: .9rem; font-weight: 600;
  color: var(--olive); cursor: pointer;
  border-bottom: 1.5px solid transparent;
  transition: border-color .2s, color .2s;
}
.card__cta:hover { border-color: currentColor; }

```

## Spotlight card (practice directions)
```css
/* ── SPOTLIGHT (Instagram-style cards) ── */
.spotlight {
  background: var(--cream-soft);
  padding-top: 88px;
  padding-bottom: 92px;
}
.spotlight__heading {
  font-family: var(--ff-airy);
  font-size: clamp(1.35rem, 2.8vw, 1.75rem);
  font-weight: 300;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brown-dark);
  margin-bottom: 40px;
}
.spotlight__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 22px;
  align-items: stretch;
}
.spotlight-card {
  position: relative;
  border-radius: var(--radius);
  overflow: hidden;
  padding: 38px 32px 40px;
  min-height: 320px;
  background-color: #141009;
  background-image:
    linear-gradient(165deg, rgba(18, 12, 8, 0.83) 0%, rgba(32, 22, 14, 0.77) 55%, rgba(12, 8, 6, 0.85) 100%),
    var(--spotlight-photo);
  background-size: cover;
  background-position: center;
  border: 1px solid rgba(80, 70, 55, 0.35);
  box-shadow: 0 24px 60px rgba(40, 28, 18, 0.2);
}
.spotlight-card--trenazh {
  background-image:
    linear-gradient(165deg, rgba(18, 12, 8, 0.83) 0%, rgba(32, 22, 14, 0.77) 55%, rgba(12, 8, 6, 0.85) 100%),
    url("../images/trenazh-card.png");
  background-position: center 28%;
}
.spotlight-card--dance {
  background-image:
    linear-gradient(165deg, rgba(18, 12, 8, 0.83) 0%, rgba(32, 22, 14, 0.77) 55%, rgba(12, 8, 6, 0.85) 100%),
    url("../images/suchasnyi-tanets-card.png");
  background-position: center 28%;
}
.spotlight-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 100% 80% at 50% 0%, rgba(40, 35, 28, 0.2) 0%, transparent 55%);
  pointer-events: none;
}
.spotlight-card > * { position: relative; z-index: 1; }

.spotlight-card__title {
  font-family: var(--ff-airy);
  font-size: clamp(1.5rem, 3vw, 1.95rem);
  font-weight: 300;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #fff;
  margin-bottom: 10px;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.4);
}
.spotlight-card__duration {
  font-family: var(--ff-airy);
  font-size: 0.82rem;
  font-weight: 300;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.68);
  margin-bottom: 22px;
}
.spotlight-card__tagline {
  font-size: 0.9rem;
  line-height: 1.58;
  color: rgba(255, 248, 240, 0.82);
  margin: -8px 0 20px;
  max-width: 40ch;
}

.ig-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ig-list li {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin: 0;
}
.ig-list__rule {
  flex: 0 0 clamp(56px, 18%, 120px);
  height: 1px;
  margin-top: 0.62em;
  background: var(--olive-line);
  align-self: flex-start;
  position: relative;
  box-shadow: 0 0 0 1px rgba(107, 114, 56, 0.15);
}
.ig-list__rule::after {
  content: "";
  position: absolute;
  right: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--olive-line);
  box-shadow: 0 0 0 2px rgba(20, 16, 10, 0.35);
}
.ig-list__text {
  flex: 1;
  font-size: 0.9rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 400;
}

.spotlight__footer {
  margin-top: 36px;
  padding-top: 28px;
  border-top: 1px solid var(--cream-mid);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 28px;
  font-family: var(--ff-airy);
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brown-mid);
}
.spotlight__footer-times {
  color: var(--olive-dim);
  letter-spacing: 0.12em;
}

```

## Pricing card
```css
/* ── PRICING ── */
.pricing { background: var(--cream); }
.pricing__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  margin-top: 48px;
}

.pricing-card {
  background: var(--white);
  border-radius: var(--radius);
  padding: 36px 32px 32px;
  box-shadow: 0 4px 32px var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.pricing-card__header { display: flex; flex-direction: column; gap: 4px; }
.pricing-card__title {
  font-family: var(--ff-airy);
  font-size: clamp(1.25rem, 2.5vw, 1.55rem);
  font-weight: 300;
  letter-spacing: 0.04em;
  color: var(--brown-dark);
}
.pricing-card__duration {
  font-size: .82rem;
  color: var(--brown-light);
  font-weight: 500;
  letter-spacing: .04em;
}

.pricing-card__tiers {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.pricing-tier {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--cream-mid);
}
.pricing-tier--highlight {
  background: var(--cream-soft);
  border-color: var(--olive-line);
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.pricing-tier--highlight .pricing-tier__price {
  font-size: 1.55rem;
}

.pricing-tier__main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pricing-tier__label {
  font-size: .9rem;
  font-weight: 500;
  color: var(--brown-mid);
}
.pricing-tier__badge {
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  background: var(--olive);
  color: var(--white);
  padding: 2px 8px;
  border-radius: 20px;
}
.pricing-tier__price {
  font-family: var(--ff-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--brown-dark);
  white-space: nowrap;
}
.pricing-tier__currency {
  font-size: .75em;
  font-weight: 500;
  color: var(--brown-light);
}

.pricing-card__cta { margin-top: auto; }

@media (max-width: 640px) {
  .pricing__grid { grid-template-columns: 1fr; }
  .pricing-card { padding: 28px 22px 26px; }
}

```

## Accordion
```css
/* ── ACCORDION ── */
.accordion { display: flex; flex-direction: column; gap: 2px; }
.accordion__item {
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--white);
  border: 1px solid var(--cream-mid);
  transition: border-color .2s;
}
.accordion__item[open] { border-color: var(--brown-mid); }

.accordion__q {
  list-style: none;
  padding: 18px 22px;
  font-weight: 600;
  font-size: .97rem;
  cursor: pointer;
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px;
  color: var(--brown-dark);
  user-select: none;
}
.accordion__q::-webkit-details-marker { display: none; }
.accordion__icon {
  flex-shrink: 0;
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--brown-mid);
  position: relative;
  transition: transform .3s ease;
}
.accordion__icon::before,
.accordion__icon::after {
  content: ""; position: absolute;
  background: var(--brown-dark);
  border-radius: 2px;
}
.accordion__icon::before { width: 10px; height: 1.5px; top: 50%; left: 50%; transform: translate(-50%,-50%); }
.accordion__icon::after  { width: 1.5px; height: 10px; top: 50%; left: 50%; transform: translate(-50%,-50%); transition: transform .3s ease, opacity .3s; }
details[open] .accordion__icon::after { transform: translate(-50%,-50%) rotate(90deg); opacity: 0; }

.accordion__a {
  padding: 0 22px 18px;
  font-size: .92rem; line-height: 1.7;
  color: var(--brown-mid);
}

```

## Modal (signup `<dialog>`)
```css
/* ── MODAL ── */
.modal__backdrop {
  display: none;
  position: fixed; inset: 0; z-index: 199;
  background: rgba(69,48,29,.45);
  backdrop-filter: blur(4px);
}
.modal__backdrop.active { display: block; }

.modal {
  border: none; padding: 0;
  border-radius: var(--radius);
  width: min(520px, calc(100vw - 40px));
  max-height: 92svh; overflow-y: auto;
  background: var(--white);
  box-shadow: 0 30px 80px rgba(69,48,29,.22);
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 200;
  padding: 40px 36px;
  font-family: var(--ff-body);
  transition: opacity .25s ease, transform .25s ease;
}
.modal:not([open]) { display: none; }
.modal[open] { display: block; }

.modal__close {
  position: absolute; top: 18px; right: 20px;
  background: none; border: none; font-size: 1.1rem;
  color: var(--brown-light); cursor: pointer;
  width: 30px; height: 30px; display: grid; place-items: center;
  border-radius: 50%;
  transition: background .2s, color .2s;
}
.modal__close:hover { background: var(--cream-soft); color: var(--brown-dark); }

.modal__eyebrow {
  font-size: .8rem; font-weight: 700;
  letter-spacing: .15em; text-transform: uppercase;
  color: var(--olive); margin-bottom: 8px;
}
.modal__title {
  font-family: var(--ff-brand);
  font-weight: 700;
  letter-spacing: -0.01em;
  font-size: 1.9rem; color: var(--brown-dark);
  margin-bottom: 8px;
}
.modal__sub { font-size: .95rem; color: var(--brown-mid); margin-bottom: 28px; line-height: 1.6; }

.modal__form { display: flex; flex-direction: column; gap: 18px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: .85rem; font-weight: 600; color: var(--brown-mid); }

.form-group input {
  padding: 13px 16px;
  border: 1.5px solid var(--cream-mid);
  border-radius: var(--radius-sm);
  font-family: var(--ff-body); font-size: .97rem;
  background: var(--cream);
  color: var(--brown-dark);
  outline: none;
  transition: border-color .2s;
}
.form-group input:focus { border-color: var(--brown-mid); }

/* Polished native selects — однаковий стиль з адмін-панеллю */
.form-group select {
  width: 100%;
  min-height: 48px;
  padding: 12px 44px 12px 16px;
  border: 1.5px solid var(--cream-mid);
  border-radius: var(--radius-sm);
  font-family: var(--ff-body); font-size: .97rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--brown-dark);
  background-color: var(--cream);
  background-image: var(--select-chevron);
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 22px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  color-scheme: light;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.75),
    inset 0 -1px 0 rgba(69, 48, 29, 0.06);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}
.form-group select:hover { border-color: var(--brown-light); }
.form-group select:focus {
  border-color: var(--olive);
  background-color: var(--white);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.95),
    0 0 0 3px rgba(116, 134, 47, 0.2);
}
.form-group select:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.form-group select option {
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  background: var(--white);
  color: var(--brown-dark);
}
.form-group select option:checked,
.form-group select option:hover,
.form-group select option:focus-visible {
  background: linear-gradient(180deg, rgba(116, 134, 47, 0.2) 0%, rgba(116, 134, 47, 0.28) 100%) !important;
  color: var(--brown-dark) !important;
  -webkit-text-fill-color: var(--brown-dark);
  box-shadow: 0 0 0 999px rgba(116, 134, 47, 0.22) inset;
}

.form-group input.error { border-color: #c0392b; }
.form-group select.error { border-color: #c0392b; }
.form-error { font-size: .8rem; color: #c0392b; min-height: 1em; }

.modal__success {
  text-align: center; padding: 20px 0 8px;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.modal__success[hidden] { display: none; }
.modal__checkmark {
  width: 52px; height: 52px;
  background: var(--olive);
  color: white; font-size: 1.4rem;
  border-radius: 50%;
  display: grid; place-items: center;
}
.modal__checkmark--always {
  margin: 0 auto 16px;
}
.modal__success p { font-size: 1rem; font-weight: 500; color: var(--brown-dark); }
.modal__sub--success { margin: 0; text-align: center; }

```

## Toast
```css
/* ── TOAST NOTIFICATIONS ── */
.toast-container {
  position: fixed;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
  width: max-content;
  max-width: calc(100vw - 32px);
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px 14px 16px;
  background: var(--brown-dark);
  border: 1px solid rgba(139, 114, 88, 0.3);
  border-radius: 50px;
  box-shadow:
    0 8px 32px rgba(40, 28, 18, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  opacity: 0;
  transform: translateY(16px) scale(0.96);
  transition:
    opacity 0.38s cubic-bezier(0.25, 0.8, 0.25, 1),
    transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1);
  white-space: nowrap;
}
.toast.is-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.toast__icon {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--olive);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.toast__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.toast__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--cream);
  line-height: 1.3;
}
.toast__desc {
  font-size: 0.78rem;
  color: rgba(255, 242, 236, 0.65);
  line-height: 1.3;
}
@media (prefers-reduced-motion: reduce) {
  .toast { transition: opacity 0.2s ease; transform: none; }
}

```

## Calendar (`.hero-cal`)
```css
/* ── HERO CALENDAR (вбудований блок) ── */
.hero-cal {
  width: 100%;
  max-width: 440px;
  margin-left: auto;
  margin-right: auto;
  padding: 22px 20px 24px;
  text-align: left;
  background: rgba(18, 12, 8, 0.58);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: var(--radius);
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.hero-cal--embedded {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  margin-top: 0;
  margin-bottom: 0;
  box-shadow:
    0 28px 64px rgba(40, 28, 18, 0.18),
    0 8px 24px rgba(40, 28, 18, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.hero-cal--embedded::before {
  content: "";
  position: absolute;
  inset: -24px;
  z-index: 0;
  background: none;
  opacity: 0;
  pointer-events: none;
}
.hero-cal--embedded > * {
  position: relative;
  z-index: 1;
}
.hero-cal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.hero-cal__month {
  font-family: var(--ff-airy);
  font-size: 0.95rem;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: capitalize;
  color: rgba(255, 255, 255, 0.94);
  margin: 0;
  flex: 1;
  text-align: center;
}
.hero-cal__nav {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.35rem;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}
.hero-cal__nav:hover {
  background: rgba(116, 134, 47, 0.35);
  border-color: rgba(180, 188, 120, 0.45);
  color: #fff;
}
.hero-cal__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
  font-family: var(--ff-airy);
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  text-align: center;
}
.hero-cal__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}
.hero-cal__day {
  position: relative;
  aspect-ratio: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.88);
  font-family: var(--ff-body);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}
.hero-cal__day:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.12);
}
.hero-cal__day:disabled {
  cursor: default;
  opacity: 0.22;
  background: transparent;
}
.hero-cal__day--muted {
  color: rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.02);
}
.hero-cal__day--today {
  box-shadow: inset 0 0 0 1px rgba(200, 206, 160, 0.55);
}
.hero-cal__day--selected {
  background: rgba(116, 134, 47, 0.42);
  border-color: rgba(180, 188, 120, 0.55);
  color: #fff;
}
.hero-cal__day--has::after {
  content: "";
  position: absolute;
  bottom: 5px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--olive-line);
  box-shadow: 0 0 0 2px rgba(18, 12, 8, 0.5);
}
.hero-cal__day--selected.hero-cal__day--has::after {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: none;
}
.hero-cal__detail {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  min-height: 4.5rem;
}
.hero-cal__detail-date {
  font-family: var(--ff-airy);
  font-size: 0.72rem;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.62);
  margin: 0 0 12px;
}
.hero-cal__sessions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero-cal__session {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.hero-cal__session time {
  font-family: var(--ff-airy);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: rgba(220, 225, 185, 0.95);
}
.hero-cal__session-type {
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
  margin: 0;
}
.hero-cal__session-meta {
  font-size: 0.78rem;
  line-height: 1.45;
  color: rgba(255, 248, 240, 0.72);
  margin: 0;
}
.hero-cal__empty {
  font-size: 0.86rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
  font-style: italic;
}

```

## Testimonial card
- File: `assets/css/testimonials.css`

```css
/* ── TESTIMONIALS ── */
.testimonials {
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, #fff8f3 0%, var(--cream-soft) 48%, #f5ebe2 100%);
  border-top: 1px solid var(--cream-mid);
  border-bottom: 1px solid var(--cream-mid);
}
.testimonials::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 12% 22%, rgba(116, 134, 47, 0.12) 0 140px, transparent 140px),
    radial-gradient(circle at 88% 68%, rgba(69, 48, 29, 0.07) 0 180px, transparent 180px);
  opacity: 0.85;
}
.testimonials__inner { position: relative; z-index: 1; }
.testimonials__hint {
  margin: 10px 0 36px;
  font-family: var(--ff-airy);
  font-size: 0.82rem;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brown-light);
}
.testimonials__carousel {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}
.testimonials__stack {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(720px, calc(100% - 48px));
  height: calc(100% - 8px);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 0;
}
.testimonials__stack-layer {
  position: absolute;
  inset: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid rgba(116, 134, 47, 0.14);
  background: rgba(255, 252, 248, 0.55);
  box-shadow: 0 10px 28px rgba(40, 28, 18, 0.08);
}
.testimonials__stack-layer:nth-child(1) { transform: translateY(10px) scale(0.985); opacity: 0.55; }
.testimonials__stack-layer:nth-child(2) { transform: translateY(20px) scale(0.97); opacity: 0.32; }
.testimonials__viewport {
  position: relative;
  z-index: 1;
  min-width: 0;
  overflow: hidden;
  touch-action: pan-y pinch-zoom;
  cursor: grab;
}
.testimonials__viewport.is-dragging { cursor: grabbing; }
.testimonials__track { position: relative; min-height: 280px; }
.testimonial-card {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: translateX(28px) scale(0.985);
  filter: blur(3px);
  pointer-events: none;
  transition:
    opacity 0.52s cubic-bezier(0.2, 0.7, 0.25, 1),
    transform 0.52s cubic-bezier(0.2, 0.7, 0.25, 1),
    filter 0.52s cubic-bezier(0.2, 0.7, 0.25, 1);
  will-change: opacity, transform, filter;
}
.testimonial-card--active {
  position: relative;
  opacity: 1;
  transform: translateX(0) scale(1);
  filter: blur(0);
  pointer-events: auto;
}
.testimonial-card.is-leaving-left { opacity: 0; transform: translateX(-36px) scale(0.98); filter: blur(2px); }
.testimonial-card.is-leaving-right { opacity: 0; transform: translateX(36px) scale(0.98); filter: blur(2px); }
.testimonial-card.is-entering-left { opacity: 0; transform: translateX(-36px) scale(0.985); filter: blur(3px); }
.testimonial-card.is-entering-right { opacity: 0; transform: translateX(36px) scale(0.985); filter: blur(3px); }
.testimonial-card__inner {
  position: relative;
  padding: 34px 34px 30px;
  border-radius: var(--radius);
  background: rgba(255, 252, 248, 0.88);
  backdrop-filter: blur(18px) saturate(1.12);
  -webkit-backdrop-filter: blur(18px) saturate(1.12);
  border: 1px solid rgba(255, 255, 255, 0.62);
  box-shadow: 0 22px 56px rgba(40, 28, 18, 0.14), 0 0 0 1px rgba(116, 134, 47, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72);
}
.testimonial-card__inner::before {
  content: "«";
  position: absolute;
  top: 8px;
  right: 22px;
  font-family: var(--ff-airy);
  font-size: 4.2rem;
  font-weight: 200;
  line-height: 1;
  color: rgba(116, 134, 47, 0.14);
  pointer-events: none;
  user-select: none;
}
.testimonial-card__text {
  margin: 0 0 26px;
  font-size: clamp(0.94rem, 2.1vw, 1.02rem);
  line-height: 1.72;
  color: rgba(69, 48, 29, 0.9);
  font-style: italic;
}
.testimonial-card__author { display: flex; align-items: center; gap: 14px; }
.testimonial-card__avatar {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--ff-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--white);
  background: linear-gradient(145deg, var(--olive) 0%, var(--olive-dim) 100%);
  box-shadow: 0 6px 16px rgba(94, 108, 35, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
.testimonial-card__meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.testimonial-card__name {
  font-family: var(--ff-airy);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--brown-dark);
}
.testimonial-card__role { font-size: 0.82rem; color: var(--brown-light); letter-spacing: 0.03em; }
.testimonials__nav {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1.5px solid rgba(116, 134, 47, 0.28);
  background: rgba(255, 252, 248, 0.92);
  color: var(--olive-dim);
  display: grid;
  place-items: center;
  box-shadow: 0 6px 18px rgba(40, 28, 18, 0.1);
  transition: background 0.22s ease, border-color 0.22s ease, color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;
}
.testimonials__nav:hover {
  background: var(--white);
  border-color: var(--olive);
  color: var(--olive);
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(40, 28, 18, 0.14);
}
.testimonials__nav:active { transform: translateY(0); }
.testimonials__swipe-hint {
  display: none;
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brown-light);
  animation: testimonialsSwipePulse 2.8s ease-in-out infinite;
}
@keyframes testimonialsSwipePulse {
  0%, 100% { opacity: 0.45; transform: translateX(-50%) translateY(0); }
  50% { opacity: 0.9; transform: translateX(-50%) translateY(-3px); }
}
.testimonials__footer {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 14px 20px;
  align-items: center;
  max-width: 520px;
  margin: 0 auto;
}
.testimonials__progress {
  grid-column: 1 / -1;
  height: 3px;
  border-radius: 999px;
  background: rgba(69, 48, 29, 0.1);
  overflow: hidden;
}
.testimonials__progress-fill {
  display: block;
  height: 100%;
  width: 10%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--olive-dim), var(--olive));
  transform-origin: left center;
  transition: width 0.52s cubic-bezier(0.2, 0.7, 0.25, 1);
}
.testimonials__dots { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-start; }
.testimonials__dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(69, 48, 29, 0.18);
  cursor: pointer;
  transition: background 0.3s ease, transform 0.3s cubic-bezier(0.2, 0.7, 0.25, 1), width 0.3s ease;
}
.testimonials__dot--active { background: var(--olive); transform: scale(1.2); width: 18px; border-radius: 999px; }
.testimonials__counter {
  font-family: var(--ff-airy);
  font-size: 0.82rem;
  font-weight: 400;
  letter-spacing: 0.12em;
  color: var(--brown-mid);
  white-space: nowrap;
}
.testimonials__counter-sep { margin: 0 0.15em; opacity: 0.5; }

@media (max-width: 700px) {
  .testimonials__carousel { grid-template-columns: 1fr; gap: 0; padding-bottom: 22px; }
  .testimonials__nav { display: none; }
  .testimonials__viewport { margin: 0 -4px; }
  .testimonial-card__inner { padding: 26px 22px 24px; }
  .testimonials__swipe-hint { display: flex; }
  .testimonials__footer { max-width: none; grid-template-columns: 1fr; text-align: center; }
  .testimonials__dots { justify-content: center; }
  .testimonials__counter { justify-self: center; }
}
@media (prefers-reduced-motion: reduce) {
  .testimonial-card { transition: opacity 0.2s ease; transform: none; filter: none; }
  .testimonial-card.is-leaving-left,
  .testimonial-card.is-leaving-right,
  .testimonial-card.is-entering-left,
  .testimonial-card.is-entering-right { transform: none; filter: none; }
  .testimonials__swipe-hint { animation: none; opacity: 0.7; }
  .testimonials__progress-fill { transition: width 0.2s ease; }
}

```

## Scroll-to-top
```css
/* ── SCROLL-TO-TOP ── */
.scroll-top {
  position: fixed;
  bottom: 32px;
  right: 32px;
  z-index: 80;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1.5px solid rgba(116, 134, 47, 0.35);
  background: rgba(255, 248, 240, 0.92);
  color: var(--olive);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 4px 18px rgba(69, 48, 29, 0.14);
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px) scale(0.9);
  transition: opacity 0.35s ease, transform 0.35s ease, background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.scroll-top.visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}
.scroll-top:hover {
  background: var(--cream-soft);
  border-color: var(--olive);
  box-shadow: 0 8px 28px rgba(69, 48, 29, 0.2);
  transform: translateY(-3px) scale(1);
}
.scroll-top:active {
  transform: translateY(0) scale(0.96);
}

```
