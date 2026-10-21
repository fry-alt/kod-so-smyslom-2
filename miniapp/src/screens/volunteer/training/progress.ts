// Какие модули волонтёр уже прошёл. Бэкенд отдаёт только общий балл и статус, поэтому
// отметки «пройден» по модулям храним в браузере, отдельно для каждого volunteer_id.
// Это подсказка для волонтёра; решение о допуске — по статусу с сервера.

export type ModuleProgress = { score: number; passed: boolean };
export type Progress = Record<string, ModuleProgress>;

const key = (volunteerId: number) => `training_progress_${volunteerId}`;

export function loadProgress(volunteerId: number | null): Progress {
  if (!volunteerId) return {};
  try {
    return JSON.parse(localStorage.getItem(key(volunteerId)) ?? "{}") as Progress;
  } catch {
    return {};
  }
}

/** Запомнить попытку. Лучший результат не затирается худшим. */
export function saveAttempt(volunteerId: number, moduleId: string, attempt: ModuleProgress): Progress {
  const progress = loadProgress(volunteerId);
  const before = progress[moduleId];
  progress[moduleId] = {
    score: Math.max(before?.score ?? 0, attempt.score),
    passed: Boolean(before?.passed) || attempt.passed,
  };
  try {
    localStorage.setItem(key(volunteerId), JSON.stringify(progress));
  } catch {
    /* приватный режим — отметки живут до перезагрузки */
  }
  return progress;
}
