# Shared layouts

## Public site shell (`index.html`)
Fixed transparent nav over hero, mobile drawer, cream/glass sections, footer, toast container, scroll-to-top. Background is a fixed photo layer `.site-bg`.

### Nav + brand + Instagram (desktop: logo left, IG right via `display: contents`)
```html
    <!-- ── NAV ── -->
    <nav class="nav nav--hero" id="nav">
      <div class="nav__brand">
        <a class="nav__logo" href="#">
          <img class="nav__logo-mark" src="logo_bbm_circle.png" alt="" width="24" height="24" />
          <span>mozok.tilo.ruh</span>
        </a>
        <a
          class="nav__ig"
          href="https://www.instagram.com/mozok.tilo.ruh/"
          target="_blank"
          rel="noopener"
          aria-label="Instagram"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none"/>
          </svg>
        </a>
      </div>
      <button class="nav__hamburger" id="navHamburger" aria-label="Меню" aria-expanded="false">
        <span></span>
        <span></span>
        <span></span>
      </button>
    </nav>

    <!-- ── MOBILE NAV ── -->
    <nav class="mobile-nav" id="mobileNav" aria-hidden="true">
      <a href="#classes-spotlight" class="mobile-nav__link">Практики</a>
      <a href="#schedule" class="mobile-nav__link">Розклад</a>
      <a href="#values" class="mobile-nav__link">Цінності</a>
      <a href="#pricing" class="mobile-nav__link">Ціни</a>
      <button class="btn btn--primary mobile-nav__cta" id="openModalNav">Записатись</button>
    </nav>


```

Nav CSS:
```css
/* ── NAV ── */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 40px;
  background: transparent;
  transition: background .4s, box-shadow .4s;
}
.nav__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
@media (min-width: 701px) {
  /* Desktop: logo left, Instagram right — unwrap brand group */
  .nav__brand {
    display: contents;
  }
}
.nav.scrolled {
  background: rgba(255, 242, 236, 0.88);
  backdrop-filter: blur(10px);
  box-shadow: 0 1px 0 var(--cream-mid);
}
.nav.nav--hero .nav__logo {
  color: rgba(255, 255, 255, 0.96);
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: lowercase;
}
.nav.nav--hero .nav__ig {
  color: rgba(255, 255, 255, 0.78);
}
.nav.nav--hero .nav__ig:hover { color: var(--cream-soft); }
.nav.scrolled .nav__logo {
  color: var(--brown-dark);
  font-weight: 700;
  letter-spacing: -0.01em;
  text-transform: none;
}
.nav.scrolled .nav__ig { color: var(--brown-mid); }
.nav.scrolled .nav__ig:hover { color: var(--olive); }

.nav__logo {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--ff-brand);
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -.01em;
  color: var(--brown-dark);
  transition: color .35s ease, letter-spacing .35s ease, font-weight .35s ease;
}

#nav .nav__logo-mark {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex: 0 0 24px;
  object-fit: cover;
}
.nav__logo::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, rgba(116, 134, 47, 0.92), rgba(116, 134, 47, 0.2));
  transform: scaleX(0.4);
  transform-origin: left center;
  opacity: 0.72;
  transition: transform .28s ease, opacity .28s ease;
}
.nav__logo:hover::after {
  transform: scaleX(1);
  opacity: 1;
}
.nav__ig {
  color: var(--brown-mid);
  transition: color .25s ease;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.nav__ig:hover { color: var(--olive); }

```

Hamburger + mobile drawer CSS:
```css
/* ── MOBILE NAV HAMBURGER ── */
.nav__hamburger {
  display: none;
  flex-direction: column;
  gap: 5.5px;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 6px;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.nav__hamburger span {
  display: block;
  width: 22px;
  height: 1.5px;
  border-radius: 2px;
  background: currentColor;
  transform-origin: center;
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.25s ease;
}
.nav.nav--hero .nav__hamburger { color: rgba(255, 255, 255, 0.88); }
.nav.scrolled .nav__hamburger  { color: var(--brown-dark); }
.nav__hamburger:hover { background: rgba(116, 134, 47, 0.12); }
.nav__hamburger[aria-expanded="true"] span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.nav__hamburger[aria-expanded="true"] span:nth-child(2) { opacity: 0; transform: scaleX(0); }
.nav__hamburger[aria-expanded="true"] span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* ── MOBILE NAV DRAWER ── */
.mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 95;
  padding: 82px 28px 32px;
  background: rgba(255, 248, 240, 0.97);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--cream-mid);
  box-shadow: 0 12px 40px rgba(69, 48, 29, 0.1);
  transform: translateY(-110%);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.32s ease;
}
.mobile-nav.is-open {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.mobile-nav__link {
  display: block;
  font-family: var(--ff-airy);
  font-size: 1.3rem;
  font-weight: 300;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--brown-dark);
  padding: 16px 8px;
  border-bottom: 1px solid var(--cream-mid);
  transition: color 0.22s ease, padding-left 0.22s ease;
}
.mobile-nav__link:hover { color: var(--olive); padding-left: 14px; }
.mobile-nav__cta { margin-top: 22px; }

```

### Footer
```html
    <!-- ── FOOTER ── -->
    <footer class="footer">
      <span>mozok.tilo.ruh © 2026</span>
      <a href="https://www.instagram.com/mozok.tilo.ruh/" target="_blank" rel="noopener">Instagram</a>
    </footer>


```

Footer CSS:
```css
/* ── FOOTER ── */
.footer {
  padding: 28px 40px;
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
  border-top: 1px solid var(--cream-mid);
  font-size: .85rem; color: var(--brown-light);
}
.footer a:hover { color: var(--olive); }

```

Footer enhancements:
```css
/* ── FOOTER ENHANCEMENTS ── */
.footer {
  background: var(--cream-soft);
  border-top: none;
  position: relative;
}
.footer::before {
  content: "";
  position: absolute;
  top: 0;
  left: 40px;
  right: 40px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--cream-mid) 20%, var(--brown-light) 50%, var(--cream-mid) 80%, transparent);
}
.footer a { transition: color 0.22s ease; }
.footer a:hover { color: var(--olive); }
.footer span { letter-spacing: 0.04em; }

```

## Admin shell
Admin pages (`admin/*.html`) share `nav.nav--admin` + `.admin-page` + same public footer pattern. Styles in `assets/css/admin.css`.

### Admin nav (from `admin/lessons.html`, representative)
```html
    <nav class="nav nav--admin scrolled" aria-label="Адмін">
      <div class="admin-nav__inner">
        <div class="admin-nav__brand">
          <a class="admin-nav__logo nav__logo" href="../index.html">
            <img class="admin-nav__logo-mark" src="../logo_bbm_circle.png" alt="" width="28" height="28" decoding="async" />
            <span class="admin-nav__logo-text">mozok.tilo.ruh</span>
          </a>
          <span class="admin-nav__badge">Адмін</span>
        </div>
        <div id="adminNavBackdrop" class="admin-nav__backdrop admin-hide" aria-hidden="true"></div>
        <div id="adminNavDrawer" class="admin-nav__drawer admin-hide" aria-hidden="true">
          <ol id="adminNavJumps" class="admin-nav__jumps admin-hide" aria-label="Розділи панелі"></ol>
          <div id="adminNavDrawerFooter" class="admin-nav__drawer-footer admin-hide">
            <button type="button" class="admin-nav__signout" id="adminNavSignOut">
              <svg class="admin-nav__signout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span class="admin-nav__signout-label">Вийти</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="admin-nav__toggle nav__hamburger admin-hide"
          id="adminNavToggle"
          aria-label="Меню"
          aria-expanded="false"
          aria-controls="adminNavDrawer"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </nav>


```
