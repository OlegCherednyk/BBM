# Two-student review broadcast to digest teachers — Design Spec

Дата: 2026-07-12  
Статус: approved / implemented

## Контекст

Коли на занятті рівно 2 учні (абон + разове), після finalize система ставить `two_student_review_status = pending` і має надіслати викладачу форму «Ти будеш проводити цей урок?» (`notifyTeacherTwoStudentReview`).

Зараз форма йде **лише** на `conducting_telegram_chat_id` (хто натиснув «Я провожу»). Якщо ніхто не натиснув — функція одразу падає в `notifyConductingTeacherPayout` і **форма не відправляється**. Occurrence лишається `pending` без уроку й візитів (як у кейсі `bb23e0aa` від 2026-07-08).

## Цілі

1. У кейсі «2 учні + немає conducting» — надіслати форму підтвердження всім викладачам з увімкненим ранковим дайджестом.
2. Хто першим підтвердить/скасує — стає conducting (для уроку й виплати).
3. Не ламати поточну поведінку, коли conducting уже відомий.

## Нецілі

- Не змінювати логіку conduct-голосування («Я провожу»).
- Не фільтрувати отримувачів за `river_bank_scope` у цьому кейсі.
- Не розсилати форму всім digest-викладачам, якщо conducting уже є.
- Не чіпати адмінку / SQL-схему колонок (лише формат jsonb-значення).

## Поведінка

### Тригер

Після finalize бойового occurrence з `peopleCount === 2`:

| Умова | Дія |
|-------|-----|
| Є непорожній `conducting_telegram_chat_id` | Як зараз: одне повідомлення цьому chat_id |
| Немає conducting | Broadcast форми всім digest-отримувачам |

### Отримувачі broadcast

```
teachers WHERE digest_enabled = true AND chat_id IS NOT NULL AND trim(chat_id) <> ''
```

Без фільтра по берегу. Дедуп за `chat_id`.

Якщо список порожній — лог warning + fallback як зараз (`notifyConductingTeacherPayout`), без форми.

### Повідомлення

Текст і кнопки без змін:

- «Актуальний урок» → `lesson_review_keep:{reviewId}`
- «Видалити заняття» → `lesson_review_delete:{reviewId}`

Один спільний `reviewId` на весь broadcast (усі повідомлення одного occurrence).

### Після callback

1. Визначити chat_id того, хто натиснув.
2. Підставити в review state:
   - `conductingTelegramChatId` = цей chat_id
   - `conductingDisplayName` = ім’я викладача з `teachers` за `chat_id` (fallback: Telegram display name / «Викладач»)
3. Виконати `confirmTwoStudentLesson` або `cancelTwoStudentLesson` як зараз.
4. Відредагувати **усі** повідомлення broadcast цього occurrence:
   - у клікнутому — результат (підтверджено / скасовано)
   - в інших — той самий фінальний текст + порожня клавіатура  
5. Прибрати всі відповідні ключі з `activeLessonReviews`.

Якщо інший викладач натисне після resolve — відповісти «Оновлення вже неактивне» (як зараз для stale review).

### Persist / hydrate

Колонка `two_student_review_message` (jsonb):

**Новий формат (масив):**

```json
[
  { "chat_id": "...", "message_id": 123, "review_id": "r_..." },
  { "chat_id": "...", "message_id": 456, "review_id": "r_..." }
]
```

**Сумісність зі старим** (один об’єкт `{ chat_id, message_id, review_id }`):

- читання: якщо значення — об’єкт (не масив) → трактувати як масив з одного елемента;
- `ensureActiveLessonReview` / `hydratePendingTwoStudentReviewsFromDb` — шукати збіг `(chat_id, message_id, review_id)` у будь-якому елементі масиву.

Запис після broadcast: завжди масив (навіть якщо 1 отримувач у цьому шляху). Шлях «є conducting» може лишати одиночний об’єкт **або** одразу писати масив з 1 елемента — краще уніфікувати на масив в обох шляхах.

## Зміни в коді (орієнтир)

| Місце | Зміна |
|-------|--------|
| `notifyTeacherTwoStudentReview` | гілка без conducting → `loadDigestTeacherTargets()` + send loop |
| `persistTwoStudentReviewMessage` | приймати масив / append; або нова `persistTwoStudentReviewMessages` |
| `ensureActiveLessonReview` / hydrate | нормалізація jsonb → масив |
| callback `lesson_review_*` | set conducting з `ctx`; deactivate sibling messages |
| хелпер | `normalizeTwoStudentReviewMessages(raw)` |

Новий хелпер завантаження (можна поруч з `loadTeacherTargetsWithChatId`):

```js
async function loadDigestTeacherTargets() {
  // digest_enabled = true, chat_id not null, dedupe
}
```

## Тест-план

1. Finalize з 2 учнями **без** conducting → повідомлення приходять усім з `digest_enabled`.
2. Один натискає «Актуальний урок» → урок створено з його `teacher_id` / ім’ям; у інших кнопки зникли.
3. Finalize з 2 учнями **з** conducting → як раніше, лише йому.
4. Рестарт процесу з pending + масивом messages → callback з будь-якого chat_id знову працює.
5. Старий pending з одиночним об’єктом у jsonb — hydrate/callback не ламаються.
6. Немає digest-отримувачів → немає форми, payout fallback, лог.

## Ризики

- Гонка двох майже одночасних кліків: другий має отримати alreadyConfirmed / alreadyCancelled / inactive; перший виграє.
- Тестовий викладач з `digest_enabled` теж отримає форму — очікувано за правилом «усі з дайджестом».
