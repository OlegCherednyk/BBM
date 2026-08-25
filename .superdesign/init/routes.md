# Routes

Static Express app (`server.js` serves `.` via `express.static`). No SPA router.

## Public
| URL | File | Layout | Summary |
|---|---|---|---|
| `/` or `/index.html` | `index.html` | Public nav + footer | Landing: hero, practices spotlight, schedule calendar, values accordion, quotes, testimonials, pricing, signup modal |
| `/assets/*` | `assets/` | — | CSS/JS/images |
| `/logo_bbm_circle.png` | `logo_bbm_circle.png` | — | Favicon / nav mark |

## Admin (noindex)
| URL | File | Layout |
|---|---|---|
| `/admin/` `/admin/index.html` | `admin/index.html` | Admin login (minimal nav) |
| `/admin/lessons.html` | `admin/lessons.html` | Admin nav + lessons CRUD |
| `/admin/teachers.html` | `admin/teachers.html` | Teachers |
| `/admin/places.html` | `admin/places.html` | Places / banks |
| `/admin/students.html` | `admin/students.html` | Students |
| `/admin/subscriptions.html` | `admin/subscriptions.html` | Abonements |
| `/admin/prices.html` | `admin/prices.html` | Prices |
| `/admin/lesson-types.html` | `admin/lesson-types.html` | Lesson types |
| `/admin/votes.html` | `admin/votes.html` | Lesson votes |
| `/admin/stats.html` | `admin/stats.html` | Stats / SMM |

## APIs (not UI)
`/api/public-config`, `/api/signup`, `/api/admin/*`, Telegram helpers.

Key public page: Home (`index.html`) is a long single-page marketing site in Ukrainian for Kyiv conscious-movement studio **mozok.tilo.ruh**.
