// Обучение волонтёра: список модулей → чтение модуля → тест → результат.
// Открытый модуль и тест хранятся в URL, чтобы переходы можно было открыть и отменить.
import { useState } from "react";

import type { TrainingModule, VolunteerStatus } from "../../api";
import { backend, getVolunteerId, setVolunteerId } from "../../backend";
import { Icon } from "../../icons";
import { navigate, useSearchParam } from "../../router";
import { Badge, Button, ButtonLink, Card, ErrorBox, Link, Loading, StatusBadge, useLoad } from "../../ui";
import Markdown from "./training/Markdown";
import { loadProgress, saveAttempt, type Progress } from "./training/progress";
import QuizView from "./training/QuizView";

export default function Training() {
  const volunteerId = getVolunteerId();
  const { data: modules, error, loading, reload } = useLoad(backend.training);
  // статус с сервера: показываем сверху, после теста берём из ответа
  const me = useLoad(() => (volunteerId ? backend.get(volunteerId) : Promise.resolve(null)), [volunteerId]);
  const [status, setStatus] = useState<VolunteerStatus | null>(null);
  const [progress, setProgress] = useState<Progress>(() => loadProgress(volunteerId));
  const moduleParam = useSearchParam("module");
  const quizParam = useSearchParam("quiz");
  const activeModule = modules?.find((module) => String(module.id) === moduleParam) ?? null;
  const view = activeModule ? (quizParam === "1" && volunteerId ? "quiz" : "read") : "list";

  function openModule(module: TrainingModule, quiz = false) {
    navigate(`/training?module=${encodeURIComponent(module.id)}${quiz ? "&quiz=1" : ""}`);
  }

  if (view === "quiz" && activeModule && volunteerId) {
    return (
      <QuizView
        module={activeModule}
        volunteerId={volunteerId}
        onResult={(r) => {
          setProgress(saveAttempt(volunteerId, activeModule.id, { score: r.score, passed: r.passed }));
          setStatus(r.status);
        }}
        onBack={() => openModule(activeModule)}
      />
    );
  }

  if (view === "read" && activeModule) {
    const m = activeModule;
    const done = progress[m.id];
    return (
      <div className="flex flex-col gap-5">
        <Link to="/training">← К модулям</Link>
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <Card>
          <Markdown text={m.text} />
        </Card>
        {done?.passed && <p className="text-center text-hint">Вы уже прошли этот тест: {done.score}%</p>}
        {volunteerId ? (
          <ButtonLink wide variant="primary" to={`/training?module=${encodeURIComponent(m.id)}&quiz=1`}>
            {done?.passed ? "Пройти тест ещё раз" : "Пройти тест"}
          </ButtonLink>
        ) : (
          <NoForm />
        )}
        <ButtonLink wide to="/training">
          Вернуться к модулям
        </ButtonLink>
      </div>
    );
  }

  const currentStatus = status ?? me.data?.status ?? null;
  const required = modules?.filter((m) => m.required) ?? [];
  const requiredDone = required.filter((m) => progress[m.id]?.passed).length;
  const nextRequired = required.find((m) => !progress[m.id]?.passed);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Обучение</h1>
      <p className="text-lg">
        Прочитайте модули и ответьте на несколько вопросов после каждого. Чтобы получить допуск, пройдите все
        обязательные модули — нужно не меньше 70% правильных ответов.
      </p>

      {!volunteerId && <NoForm />}
      {me.error && (
        // например, анкету удалили или моки сбросились — тогда тест не сохранится
        <div className="flex flex-col gap-3">
          <ErrorBox text={`Не удалось узнать ваш статус. ${me.error}`} onRetry={me.reload} />
          <Button
            variant="secondary"
            onClick={() => {
              setVolunteerId(null);
              navigate("/form");
            }}
          >
            Заполнить анкету заново
          </Button>
        </div>
      )}
      {currentStatus && (
        <Card className="flex flex-col gap-2">
          <div>
            <span className="text-hint">Ваш статус: </span>
            <StatusBadge status={currentStatus} />
          </div>
          {required.length > 0 && (
            <p>
              Обязательных модулей пройдено: <b>{requiredDone}</b> из {required.length}
            </p>
          )}
          {currentStatus === "trained" && (
            <p className="font-semibold">
              <Icon name="sparkles" className="mr-1.5 size-[1.15em] align-[-0.2em] text-cta" />
              Обучение пройдено! Теперь запишитесь на собеседование с координатором.</p>
          )}
        </Card>
      )}

      {nextRequired && (
        <Card className="flex flex-col gap-3 border-2 border-accent bg-soft">
          <div>
            <p className="text-sm font-semibold text-link">С чего начать</p>
            <p className="text-lg font-semibold">Модуль {modules?.findIndex((m) => m.id === nextRequired.id)! + 1}: {nextRequired.title}</p>
            <p className="text-sm text-hint">Обязательный модуль. Прочитайте его и ответьте на вопросы.</p>
          </div>
          <ButtonLink wide variant="primary" to={`/training?module=${encodeURIComponent(nextRequired.id)}`}>
            {progress[nextRequired.id] ? "Продолжить модуль" : "Начать обучение"}
          </ButtonLink>
        </Card>
      )}

      {loading && <Loading text="Загружаем модули…" />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {modules?.length === 0 && <p className="text-hint">Модулей пока нет — фонд скоро их добавит.</p>}
      <ol className="flex flex-col gap-3">
        {modules?.map((m, i) => {
          const done = progress[m.id];
          return (
            <li key={m.id}>
              <Link
                to={`/training?module=${encodeURIComponent(m.id)}`}
                className={`flex w-full flex-col gap-1 rounded-3xl border-2 bg-surface p-5 text-left transition active:scale-[.99] ${
                  done?.passed ? "border-green-600" : "border-transparent"
                }`}
              >
                <span className="text-sm text-hint">
                  Модуль {i + 1} · {m.required ? "обязательный" : "по желанию"}
                </span>
                <span className="text-lg font-semibold">{m.title}</span>
                <span className="flex flex-wrap items-center gap-2 pt-1">
                  {done?.passed ? (
                    <Badge className="bg-green-100 text-green-900"><span aria-hidden="true">✓ </span>Пройден · {done.score}%</Badge>
                  ) : done ? (
                    <Badge className="bg-amber-100 text-amber-900">Не сдан · {done.score}% — попробуйте ещё</Badge>
                  ) : (
                    <Badge className="bg-page">Не начат</Badge>
                  )}
                  <span className="text-link">{done?.passed ? "Прочитать ещё раз →" : done ? "Продолжить →" : "Начать →"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {currentStatus === "trained" && (
        <ButtonLink wide variant="primary" to="/interview">
          Записаться на собеседование
        </ButtonLink>
      )}
    </div>
  );
}

/** Тест привязан к анкете: без неё некуда записать результат. */
function NoForm() {
  return (
    <Card className="flex flex-col gap-3">
      <p>Чтобы пройти тест и получить допуск, сначала заполните анкету — это займёт пару минут.</p>
      <Button wide onClick={() => navigate("/form")}>
        Заполнить анкету
      </Button>
    </Card>
  );
}
