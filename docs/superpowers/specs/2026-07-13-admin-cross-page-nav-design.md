# Admin cross-page nav — Design Spec

Дата: 2026-07-13  
Статус: approved (підхід B)

## Контекст

Адмін-розділи розбиті на окремі HTML-сторінки. У `places.html` уже були хардкод-лінки в `#adminNavJumps`; на інших сторінках список порожній — міжсторінкової навігації немає.

## Цілі

1. Єдине меню розділів на всіх admin-сторінках (окрім login).
2. Один джерело правди в JS (без дублювання HTML).
3. Поточна сторінка з `aria-current="page"`.

## Нецілі

- Не додавати `lesson-types.html` у меню.
- Не міняти візуальний стиль drawer / desktop bar (існуючий CSS).
- Не чіпати публічний сайт.

## Пункти меню (порядок)

1. Ціни — `prices.html` (`prices`)
2. Місця — `places.html` (`places`)
3. Викладачі — `teachers.html` (`teachers`)
4. Учні — `students.html` (`students`)
5. Абонементи — `subscriptions.html` (`subscriptions`)
6. Голосування — `votes.html` (`votes`)
7. Заняття — `lessons.html` (`lessons`)
8. Статистика — `stats.html` (`stats`)

## Поведінка

- При `showView("dash")`: заповнити `#adminNavJumps` з константи; показати drawer/toggle як зараз.
- `data-admin-page` на `<body>` → `aria-current="page"` на відповідному лінку.
- Login (`data-admin-page="login"`): меню не показувати.
- Прибрати хардкод-лінки з `places.html` (залишити порожній `<ol id="adminNavJumps">`).

## Зміни

| Файл | Зміна |
|------|--------|
| `assets/js/admin.js` | `ADMIN_NAV_PAGES` + `renderAdminNavLinks()`; виклик з `showView("dash")` |
| `admin/places.html` | прибрати статичні `<li>` |

Інші HTML уже мають порожній `#adminNavJumps` — без змін, якщо структура збігається.
