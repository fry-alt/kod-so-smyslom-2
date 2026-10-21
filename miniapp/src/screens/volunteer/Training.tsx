// Обучение волонтёра: список модулей → чтение модуля → тест → результат.
// Весь путь — внутри /training, на состоянии экрана (без новых адресов).
import { useState } from "react";

import type { TrainingModule, VolunteerStatus } from "../../api";
import { backend, getVolunteerId, setVolunteerId } from "../../backend";
import { STATUS, STATUS_COLOR } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, Card, ErrorBox, Loading, useLoad } from "../../ui";
import Markdown from "./training/Markdown";
import { loadProgress, saveAttempt, type Progress } from "./training/progress";
import QuizView from "./training/QuizView";

type View = { screen: "list" } | { screen: "read" | "quiz"; module: TrainingModule };

export default function Training() {
  const volunteerId = getVolunteerId();
  const { data: modules, error, loading, reload } = useLoad(backend.training);
  // статус с сервера: показываем сверху, после теста берём из ответа
  const me = useLoad(() => (volunteerId ? backend.get(volunteerId) : Promise.resolve(null)), [volunteerId]);
  const [status, setStatus] = useState<VolunteerStatus | null>(null);
  const [progress, setProgress] = useState<Progress>(() => loadProgress(volunteerId));
  const [view, setView] = useState<View>({ screen: "list" });

  function open(next: View) {
    setView(next);
    window.scrollTo(0, 0);
  }

  if (view.screen === "quiz" && volunteerId) {
    return (
      <QuizView
        module={view.module}
        volunteerId={volunteerId}
        onResult={(r) => {
          setProgress(saveAttempt(volunteerId, view.module.id, { score: r.score, passed: r.passed }));
          setStatus(r.status);
        }}
        onBack={() => open({ screen: "list" })}
      />
    );
  }

  if (view.screen !== "list") {
    const m = view.module;
    const done = progress[m.id];
    return (
      <div className="flex flex-col gap-5">
        <button type="button" onClick={() => open({ screen: "list" })} className="min-h-12 self-start text-link">
          ← К модулям
        </button>
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <Card>
          <Markdown text={m.text} />
        </Card>
        {done?.passed && <p className="text-center text-hint">Вы уже прошли этот тест: {done.score}%</p>}
        {volunteerId ? (
          <Button wide onClick={() => open({ screen: "quiz", module: m })}>
            {done?.passed ? "Пройти тест ещё раз" : "Пройти тест"}
          </Button>
        ) : (
          <NoForm />
        )}
        <Button wide variant="secondary" onClick={() => open({ screen: "list" })}>
          Вернуться к модулям
        </Button>
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
            <Badge className={STATUS_COLOR[currentStatus]}>{STATUS[currentStatus]}</Badge>
          </div>
          {required.length > 0 && (
            <p>
              Обязательных модулей пройдено: <b>{requiredDone}</b> из {required.length}
            </p>
          )}
          {currentStatus === "trained" && (
            <p className="font-semibold">🎉 Обучение пройдено! Теперь запишитесь на собеседование с координатором.</p>
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
          <Button wide onClick={() => open({ screen: "read", module: nextRequired })}>
            {progress[nextRequired.id] ? "Продолжить модуль" : "Начать обучение"}
          </Button>
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
              <button
                type="button"
                onClick={() => open({ screen: "read", module: m })}
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
                    <Badge className="bg-green-100 text-green-900">✓ Пройден · {done.score}%</Badge>
                  ) : done ? (
                    <Badge className="bg-amber-100 text-amber-900">Не сдан · {done.score}% — попробуйте ещё</Badge>
                  ) : (
                    <Badge className="bg-page">Не начат</Badge>
                  )}
                  <span className="text-link">{done?.passed ? "Прочитать ещё раз →" : done ? "Продолжить →" : "Начать →"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {currentStatus === "trained" && (
        <Button wide onClick={() => navigate("/interview")}>
          Записаться на собеседование
        </Button>
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
