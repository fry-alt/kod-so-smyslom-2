// Какие модули волонтёр уже прошёл. Отметки хранятся на сервере (GET /volunteers/{id}/training),
// поэтому одинаковы на телефоне, компьютере и в Telegram. Решение о допуске — по статусу волонтёра.
import type { ModuleProgress as SavedProgress } from "../../../api";

export type ModuleProgress = { score: number; passed: boolean };
export type Progress = Record<string, ModuleProgress>;

/** Ответ сервера → отметки по id модуля. */
export function toProgress(saved: SavedProgress[] | null): Progress {
  return Object.fromEntries((saved ?? []).map((p) => [p.module_id, { score: p.score, passed: p.passed }]));
}
