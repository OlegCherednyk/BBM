# Extractable Superdesign DraftComponents

## NavBar
- Source: `index.html` (nav#nav) + `assets/css/styles.css` (nav rules)
- Category: layout
- Description: Fixed top nav with circular logo mark, wordmark mozok.tilo.ruh, Instagram icon; transparent on hero, cream blur when scrolled
- Extractable props: scrolled (boolean, default: false), activeItem (string, default: "home")
- Hardcoded: logo image, wordmark text, Instagram SVG and URL, hamburger markup

## MobileNav
- Source: `index.html` (nav#mobileNav)
- Category: layout
- Description: Full-width cream drawer with section links and Записатись CTA
- Extractable props: isOpen (boolean, default: false)
- Hardcoded: link labels Практики/Розклад/Цінності/Ціни, CTA text

## Footer
- Source: `index.html` footer.footer
- Category: layout
- Description: Cream footer with copyright and Instagram link
- Extractable props: none
- Hardcoded: © 2026, Instagram URL

## SignupModal
- Source: `index.html` dialog#signupModal
- Category: basic
- Description: Name + Instagram/Telegram form, success state
- Extractable props: open (boolean, default: false), success (boolean, default: false)
- Hardcoded: copy, field labels, primary submit

## SpotlightCard
- Source: `index.html` .spotlight-card + CSS
- Category: basic
- Description: Dark photo card for a practice direction with duration and ig-list
- Extractable props: title (string, default: "Тренаж"), duration (string, default: "Тривалість практики 1 година")
- Hardcoded: overlay gradients, list rule styling

## PricingCard
- Source: `index.html` .pricing-card
- Category: basic
- Description: White card with single + 8-pack prices and Записатись
- Extractable props: title, duration, singlePrice, abonPrice
- Hardcoded: badge «вигідно», currency грн

## AdminNav
- Source: `admin/lessons.html` + `assets/css/admin.css`
- Category: layout
- Description: Admin top bar with logo, Адмін badge, section jumps drawer, sign out
- Extractable props: currentPage (string, default: "lessons")
- Hardcoded: logo, badge, sign-out SVG
