// Обучение волонтёра: список модулей → чтение модуля → тест → результат.
// Открытый модуль и тест хранятся в URL, чтобы переходы можно было открыть и отменить.
// Экран широкий: сверху шапка с кольцом прогресса, ниже — «дорожка» модулей, в конце — собеседование.
import { useEffect, useState, type CSSProperties } from "react";

import type { TrainingModule, VolunteerStatus } from "../../api";
import { backend, getVolunteerId, setVolunteerId } from "../../backend";
import { Icon } from "../../icons";
import { navigate, useSearchParam } from "../../router";
import { Badge, Button, ButtonLink, Card, ErrorBox, Link, Loading, PageTitle, StatusBadge, useLoad } from "../../ui";
import Markdown from "./training/Markdown";
import { toProgress, type Progress } from "./training/progress";
import QuizView from "./training/QuizView";

/** Цвета логотипа по кругу — у каждого модуля своя метка на дорожке. */
const MODULE_COLORS = ["var(--logo-blue)", "var(--logo-green)", "var(--logo-orange)", "var(--logo-berry)", "var(--logo-cyan)"];

export default function Training() {
  const volunteerId = getVolunteerId();
  const { data: modules, error, loading, reload } = useLoad(backend.training);
  // статус с сервера: показываем сверху, после теста берём из ответа
  const me = useLoad(() => (volunteerId ? backend.get(volunteerId) : Promise.resolve(null)), [volunteerId]);
  const [status, setStatus] = useState<VolunteerStatus | null>(null);
  // отметки по модулям — с сервера; после теста перечитываем (попытка там уже сохранена)
  const saved = useLoad(
    () => (volunteerId ? backend.trainingProgress(volunteerId) : Promise.resolve([])),
    [volunteerId],
  );
  const progress = toProgress(saved.data);
  const moduleParam = useSearchParam("module");
  const quizParam = useSearchParam("quiz");
  const activeModule = modules?.find((module) => String(module.id) === moduleParam) ?? null;
  const view = activeModule ? (quizParam === "1" && volunteerId ? "quiz" : "read") : "list";

  function openModule(module: TrainingModule, quiz = false) {
    navigate(`/training?module=${encodeURIComponent(module.id)}${quiz ? "&quiz=1" : ""}`);
  }

  if (view === "quiz" && activeModule && volunteerId) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <QuizView
          module={activeModule}
          volunteerId={volunteerId}
          onResult={(r) => {
            saved.reload();
            setStatus(r.status);
          }}
          onBack={() => openModule(activeModule)}
        />
      </div>
    );
  }

  if (view === "read" && activeModule && modules) {
    return <ReadView module={activeModule} modules={modules} progress={progress} canTest={!!volunteerId} />;
  }

  const currentStatus = status ?? me.data?.status ?? null;
  const required = modules?.filter((m) => m.required) ?? [];
  const requiredDone = required.filter((m) => progress[m.id]?.passed).length;
  const nextRequired = required.find((m) => !progress[m.id]?.passed);
  const trained = currentStatus === "trained";

  return (
    <div className="flex flex-col gap-8">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-soft px-5 py-8 md:px-10 md:py-12">
        <span aria-hidden="true" className="auth-blob auth-blob-1" />
        <span aria-hidden="true" className="auth-blob auth-blob-2" />
        <span aria-hidden="true" className="auth-blob auth-blob-3" />
        <Floaters />
        {trained && <Confetti />}

        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4">
            <p className="hero-in text-sm font-semibold tracking-wide text-link uppercase">Путь волонтёра · шаг 2</p>
            <PageTitle className="hero-in md:text-5xl">Обучение</PageTitle>
            <p className="hero-in max-w-xl text-lg" style={{ animationDelay: "0.08s" }}>
              Прочитайте модули и ответьте на несколько вопросов после каждого. Чтобы получить допуск, пройдите все
              обязательные модули — нужно не меньше 70% правильных ответов.
            </p>
            {currentStatus && (
              <div className="hero-in flex flex-wrap items-center gap-2" style={{ animationDelay: "0.16s" }}>
                <span className="text-hint">Ваш статус:</span>
                <StatusBadge status={currentStatus} />
              </div>
            )}
            {(trained || (nextRequired && volunteerId)) && (
              <div className="hero-in pt-2 sm:max-w-sm" style={{ animationDelay: "0.24s" }}>
                {trained ? (
                  <ButtonLink wide variant="primary" to="/interview">
                    Записаться на собеседование
                  </ButtonLink>
                ) : (
                  nextRequired && (
                    <ButtonLink wide variant="primary" to={`/training?module=${encodeURIComponent(nextRequired.id)}`}>
                      {progress[nextRequired.id] ? "Продолжить обучение" : "Начать обучение"}
                    </ButtonLink>
                  )
                )}
              </div>
            )}
          </div>
          {required.length > 0 && <ProgressRing done={requiredDone} total={required.length} />}
        </div>
      </section>

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
      {trained && (
        <Card className="flex items-center gap-3 border-2 border-accent bg-soft">
          <Icon name="sparkles" className="size-8 shrink-0 text-cta" />
          <p className="text-lg font-semibold">Обучение пройдено! Теперь запишитесь на собеседование с координатором.</p>
        </Card>
      )}

      {loading && <Loading text="Загружаем модули…" />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {modules?.length === 0 && <p className="text-hint">Модулей пока нет — фонд скоро их добавит.</p>}

      {modules && modules.length > 0 && (
        <section className="flex flex-col gap-5">
          <h2 className="font-display text-2xl font-semibold md:text-3xl">Ваш маршрут</h2>
          <ol className="flex flex-col gap-5">
            {modules.map((m, i) => (
              <PathStop key={m.id} module={m} index={i} done={progress[m.id]} isNext={m.id === nextRequired?.id} />
            ))}
            <GoalStop index={modules.length} open={trained} />
          </ol>
        </section>
      )}
    </div>
  );
}

/** Одна остановка на дорожке: кружок с номером, линия к следующей и карточка модуля. */
function PathStop(props: { module: TrainingModule; index: number; done?: Progress[string]; isNext: boolean }) {
  const { module: m, index: i, done } = props;
  const topics = moduleTopics(m.text);
  return (
    <li
      className="path-stop relative grid grid-cols-[3.5rem_1fr] gap-4 md:grid-cols-[4.5rem_1fr]"
      style={{ "--i": i, "--c": MODULE_COLORS[i % MODULE_COLORS.length] } as CSSProperties}
    >
      <span aria-hidden="true" className={`path-line ${done?.passed ? "is-done" : ""}`} />
      <span
        aria-hidden="true"
        className={`path-node relative z-10 grid size-14 place-items-center rounded-full font-display text-xl font-semibold md:size-[4.5rem] md:text-2xl ${
          done?.passed ? "is-done" : props.isNext ? "is-next" : ""
        }`}
      >
        {done?.passed ? <Icon name="check" className="size-7 md:size-9" /> : i + 1}
      </span>
      <Link
        to={`/training?module=${encodeURIComponent(m.id)}`}
        className={`path-card lift flex min-w-0 flex-col gap-2 rounded-3xl border-2 bg-surface p-5 text-left md:p-6 ${
          props.isNext ? "border-accent" : done?.passed ? "border-green-600" : "border-transparent"
        }`}
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-hint">
          <span>
            Модуль {i + 1} · {m.required ? "обязательный" : "по желанию"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" className="size-4" />≈ {readingMinutes(m.text)} мин чтения
          </span>
          {props.isNext && <span className="font-semibold text-link">Следующий шаг</span>}
        </span>
        <span className="text-xl font-semibold md:text-2xl">{m.title}</span>
        {topics.length > 0 && <span className="text-hint">{topics.join(" · ")}</span>}
        <span className="flex flex-wrap items-center gap-2 pt-1">
          {done?.passed ? (
            <Badge className="bg-green-100 text-green-900"><span aria-hidden="true">✓ </span>Пройден · {done.score}%</Badge>
          ) : done ? (
            <Badge className="bg-amber-100 text-amber-900">Не сдан · {done.score}% — попробуйте ещё</Badge>
          ) : (
            <Badge className="bg-page">Не начат</Badge>
          )}
          <span className="path-go text-link">
            {done?.passed ? "Прочитать ещё раз" : done ? "Продолжить" : "Начать"} <span aria-hidden="true">→</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Финиш дорожки: после обучения — собеседование с координатором. */
function GoalStop(props: { index: number; open: boolean }) {
  const text = (
    <>
      <span className="text-sm text-hint">Финиш обучения</span>
      <span className="text-xl font-semibold md:text-2xl">Собеседование с координатором</span>
      <span className="text-hint">
        {props.open
          ? "Выберите удобное время — координатор расскажет, с чего начать."
          : "Откроется, когда вы пройдёте все обязательные модули."}
      </span>
    </>
  );
  return (
    <li
      className="path-stop relative grid grid-cols-[3.5rem_1fr] gap-4 md:grid-cols-[4.5rem_1fr]"
      style={{ "--i": props.index, "--c": "var(--p-cta)" } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className={`path-node relative z-10 grid size-14 place-items-center rounded-full md:size-[4.5rem] ${props.open ? "is-next" : "is-locked"}`}
      >
        <Icon name={props.open ? "handshake" : "lock"} className="size-7 md:size-9" />
      </span>
      {props.open ? (
        <Link to="/interview" className="path-card lift flex flex-col gap-2 rounded-3xl border-2 border-accent bg-surface p-5 md:p-6">
          {text}
        </Link>
      ) : (
        <div className="path-card flex flex-col gap-2 rounded-3xl border-2 border-dashed border-line p-5 md:p-6">{text}</div>
      )}
    </li>
  );
}

/** Кольцо «обязательных пройдено»: при открытии заполняется от нуля. */
function ProgressRing(props: { done: number; total: number }) {
  const r = 52;
  const length = 2 * Math.PI * r;
  const share = props.done / props.total;
  return (
    <div className="hero-in relative mx-auto grid size-48 place-items-center md:size-56" style={{ animationDelay: "0.12s" }}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--p-page)" strokeWidth="10" />
        <circle
          className="ring-fill"
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--p-accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={length}
          style={{ "--ring-from": length, "--ring-to": length * (1 - share) } as CSSProperties}
        />
      </svg>
      <p className="relative text-center">
        <span className="block font-display text-5xl font-semibold md:text-6xl">
          <CountUp to={props.done} />
          <span className="text-2xl text-hint md:text-3xl">/{props.total}</span>
        </span>
        <span className="block text-sm leading-tight text-hint">
          обязательных
          <br />
          пройдено
        </span>
      </p>
    </div>
  );
}

/** Число «досчитывает» до нужного вместе с кольцом. */
function CountUp(props: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (props.to === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(props.to);
      return;
    }
    let k = 0;
    const t = setInterval(() => {
      k += 1;
      setN(k);
      if (k >= props.to) clearInterval(t);
    }, 900 / props.to);
    return () => clearInterval(t);
  }, [props.to]);
  return <>{n}</>;
}

/** Значки, которые медленно плавают по шапке (только на широком экране). */
function Floaters() {
  const items = [
    { name: "graduation", className: "top-6 right-[36%] size-10 text-logo-blue" },
    { name: "heart", className: "bottom-8 right-[33%] size-8 text-cta" },
    { name: "leaf", className: "top-8 right-6 size-9 text-accent" },
    { name: "sparkles", className: "bottom-8 right-8 size-8 text-logo-berry" },
  ] as const;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
      {items.map((item, i) => (
        <span key={item.name} className={`floater absolute ${item.className}`} style={{ animationDelay: `${-i * 1.7}s` }}>
          <Icon name={item.name} className="size-full" />
        </span>
      ))}
    </div>
  );
}

/** Конфетти в цветах логотипа — когда обучение пройдено. */
function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0">
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              left: `${5 + i * 5.2}%`,
              background: MODULE_COLORS[i % MODULE_COLORS.length],
              animationDelay: `${(i % 6) * 0.12}s`,
              "--dx": `${(i % 2 ? 1 : -1) * (10 + (i % 5) * 8)}px`,
              "--rot": `${180 + i * 40}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Чтение модуля: текст слева, справа — закреплённая карточка с тестом и списком модулей. */
function ReadView(props: { module: TrainingModule; modules: TrainingModule[]; progress: Progress; canTest: boolean }) {
  const m = props.module;
  const done = props.progress[m.id];
  const index = props.modules.findIndex((x) => x.id === m.id);
  const testLink = `/training?module=${encodeURIComponent(m.id)}&quiz=1`;
  return (
    <div className="flex flex-col gap-6">
      <ReadingBar />
      <Link to="/training">← К модулям</Link>
      <div key={m.id} className="hero-in flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-x-3 text-hint">
          <span>
            Модуль {index + 1} из {props.modules.length} · {m.required ? "обязательный" : "по желанию"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" className="size-4" />≈ {readingMinutes(m.text)} мин чтения
          </span>
        </p>
        <PageTitle className="md:text-5xl">{m.title}</PageTitle>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <Card key={m.id} className="hero-in p-6 md:p-10">
          <div className="max-w-[44rem] text-lg">
            <Markdown text={m.text} />
          </div>
        </Card>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <Card className="flex flex-col gap-3 border-2 border-accent bg-soft">
            <p className="text-lg font-semibold">Прочитали?</p>
            <p className="text-hint">
              {done?.passed
                ? `Вы уже прошли этот тест: ${done.score}%`
                : "Ответьте на несколько вопросов — нужно не меньше 70% правильных."}
            </p>
            {props.canTest ? (
              <ButtonLink wide variant="primary" to={testLink}>
                {done?.passed ? "Пройти тест ещё раз" : "Пройти тест"}
              </ButtonLink>
            ) : (
              <NoForm />
            )}
          </Card>
          <nav aria-label="Модули обучения" className="flex flex-col gap-1">
            {props.modules.map((x, i) => {
              const passed = props.progress[x.id]?.passed;
              return (
                <Link
                  key={x.id}
                  to={`/training?module=${encodeURIComponent(x.id)}`}
                  current={x.id === m.id}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 transition ${
                    x.id === m.id ? "bg-surface font-semibold" : "hover:bg-surface"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                    style={{ background: passed ? "var(--p-accent)" : MODULE_COLORS[i % MODULE_COLORS.length] }}
                  >
                    {passed ? <Icon name="check" className="size-4" /> : i + 1}
                  </span>
                  <span className="min-w-0">{x.title}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      </div>
    </div>
  );
}

/** Тонкая полоска вверху экрана — сколько текста модуля уже прочитано. */
function ReadingBar() {
  const [share, setShare] = useState(0);
  useEffect(() => {
    function update() {
      const max = document.documentElement.scrollHeight - innerHeight;
      setShare(max > 0 ? Math.min(1, scrollY / max) : 1);
    }
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, []);
  return (
    <div aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-1.5">
      <div className="reading-bar h-full origin-left" style={{ transform: `scaleX(${share})` }} />
    </div>
  );
}

/** Примерное время чтения: не спеша, около 150 слов в минуту. */
function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 150));
}

/** Темы модуля — его подзаголовки «## …», чтобы было видно, о чём он. */
function moduleTopics(text: string): string[] {
  return [...text.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim()).slice(0, 3);
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
