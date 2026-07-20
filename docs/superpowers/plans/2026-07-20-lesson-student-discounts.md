# Lesson student discounts — implementation plan

> **For agentic workers:** implement task-by-task; steps use checkboxes.

**Goal:** Per-student % or ₴ discounts on a lesson, reflected in finance UI and stats.

**Architecture:** Table `lesson_student_discounts` + pure `lesson-discount.js` math applied in finance breakdown and stats revenue paths. Admin UI: `%` card button + discount modal; finance modal shows chips/strikethrough.

**Tech Stack:** Express, Supabase, vanilla admin JS/CSS.

## Tasks

- [x] Pure discount helpers + self-check script
- [x] SQL migration + apply
- [x] Wire discounts into finance + stats + teacher payout
- [x] GET/PUT `/api/admin/lessons/:lessonId/discounts`
- [x] Lesson card `%` button, discount modal, finance redesign
- [ ] Manual smoke: open lesson → set % and ₴ → check finance + stats
