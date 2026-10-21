import type { ReactNode } from "react";

import type { Interview, Participation, Volunteer } from "../../api";
import { backend, getVolunteerId, setVolunteerId } from "../../backend";
import { STATUS, STATUS_COLOR } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, Card, ErrorBox, FLAIR, flairHandlers, Loading, useLoad } from "../../ui";

/** Статус волонтёра: путь «анкета → собеседование → обучение → допуск → занятия», ближайший звонок и что дальше.
 *  Итог собеседования (оценка координатора) здесь не показываем — он только для фонда. */
export default function Me() {
  const id = getVolunteerId();
  const { data: v, error, loading, reload } = useLoad(
    () => (id ? backend.get(id) : Promise.resolve(null)),
    [id],
  );
  // приглашения координатора — показываем сверху, чтобы не пропустить
  const { data: mine } = useLoad(
    () => (id ? backend.myParticipations(id) : Promise.resolve([])),
    [id],
  );
  const invites = mine?.filter((p) => p.status === "invited") ?? [];
  const { data: interviews } = useLoad(
    () => (id ? backend.interviews(id) : Promise.resolve([])),
    [id],
  );
  const call = nextCall(interviews ?? []);

  if (!id) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl font-bold">Мой статус</h1>
        <p>Вы ещё не заполнили анкету.</p>
        <Button wide onClick={() => navigate("/form")}>
          Заполнить анкету
        </Button>
      </div>
    );
  }
  if (loading) return <Loading />;
  if (error) {
    // например, анкету удалили или моки сбросились после перезагрузки
    return (
      <div className="flex flex-col gap-4">
        <ErrorBox text={error} onRetry={reload} />
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
    );
  }
  if (!v) return null;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold">{v.name}</h1>
      {call && <CallCard i={call} />}
      {invites.length > 0 && (
        <Card className="flex flex-col gap-3 ring-2 ring-accent">
          <p className="text-lg font-semibold">
            📩 Вас пригласили: {invites.map((p) => `«${p.opportunity_title}»`).join(", ")}
          </p>
          <Button wide onClick={() => navigate("/opportunities")}>
            Посмотреть и подтвердить
          </Button>
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <div>
          <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge>
        </div>
        {v.profile && (
          <div className="flex flex-wrap gap-2">
            {v.profile.skills.map((s) => (
              <Badge key={s} className="bg-page">
                {s}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-hint">
          Волонтёрских часов: <b className="text-ink">{v.hours}</b>
          {v.training_score !== null && (
            <>
              {" "}
              · Балл за обучение: <b className="text-ink">{v.training_score}%</b>
            </>
          )}
        </p>
      </Card>
      <Path v={v} interviews={interviews ?? []} participations={mine ?? []} upcoming={call} />
      <Button wide onClick={() => navigate("/training")}>
        Обучение
      </Button>
      <Button wide variant="secondary" onClick={() => navigate("/opportunities")}>
        Куда можно пойти
      </Button>
      <Button wide variant="secondary" onClick={() => navigate("/history")}>
        Моя история и часы
      </Button>
      <Button wide variant="secondary" onClick={() => navigate("/ask")}>
        Спросить о фонде
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setVolunteerId(null);
          navigate("/");
        }}
      >
        Это не я — выйти
      </Button>
    </div>
  );
}

/** Ближайшее назначенное собеседование. Опоздавшего ещё пускаем: звонок виден 2 часа после начала. */
function nextCall(list: Interview[]): Interview | null {
  const from = Date.now() - 2 * 3600_000;
  return (
    list
      .filter((i) => i.status === "scheduled" && new Date(i.starts_at).getTime() >= from)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null
  );
}

/** «22 октября в 15:00». */
function callWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("ru", { day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return `${day} в ${time}`;
}

function CallCard({ i }: { i: Interview }) {
  return (
    <section className="flex flex-col gap-4 rounded-[1.75rem] bg-soft p-5">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-hint">📹 Видеособеседование с координатором</span>
        <span className="font-display text-2xl font-semibold">{callWhen(i.starts_at)}</span>
        <span className="text-hint">Перед входом вы увидите себя и проверите микрофон.</span>
      </div>
      <button
        type="button"
        onClick={() => navigate(`/call/${encodeURIComponent(i.token)}`)}
        {...flairHandlers}
        className={`btn-flair min-h-14 w-full rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] ${FLAIR.cta}`}
      >
        Войти в звонок
      </button>
    </section>
  );
}

type StepKey = "form" | "interview" | "training" | "approval" | "classes";
const STEP_TITLE: Record<StepKey, string> = {
  form: "Анкета",
  interview: "Собеседование",
  training: "Обучение",
  approval: "Допуск",
  classes: "Занятия",
};
/** Цвет текущего шага — цвета букв логотипа; на светлых (голубой, жёлтый) цифра тёмная. */
const STEP_COLORS = ["bg-logo-blue text-white", "bg-logo-berry text-white", "bg-logo-cyan text-ink", "bg-pop text-ink", "bg-accent text-white"];

/** Шаги пути: пройденные — с галочкой, текущий — крупно и с подсказкой, что делать. */
function Path(props: { v: Volunteer; interviews: Interview[]; participations: Participation[]; upcoming: Interview | null }) {
  const { v } = props;
  const later = (...s: Volunteer["status"][]) => s.includes(v.status);
  const done: Record<StepKey, boolean> = {
    form: true,
    // до видеособеседований на сайте знакомились без системы — поэтому «дальше новой анкеты» тоже считается
    interview: props.interviews.some((i) => i.status === "done") || !later("new"),
    training: later("trained", "approved", "active"),
    approval: later("approved", "active"),
    classes: later("active") || props.participations.some((p) => p.status === "attended"),
  };
  const keys = Object.keys(STEP_TITLE) as StepKey[];
  const current = keys.find((k) => !done[k]) ?? null;

  const hint: Record<StepKey, ReactNode> = {
    form: null,
    interview: props.upcoming
      ? `Назначено на ${callWhen(props.upcoming.starts_at)}. Кнопка «Войти в звонок» — выше.`
      : "Координатор пригласит вас на короткий видеозвонок. Ссылка придёт в Telegram и появится здесь.",
    training: (
      <>
        <span>Короткий курс о наших подопечных и правилах фонда, в конце — тест.</span>
        <Button onClick={() => navigate("/training")}>{v.status === "training" ? "Продолжить обучение" : "Пройти обучение"}</Button>
      </>
    ),
    approval: "Координатор посмотрит результаты и допустит вас к занятиям. Обычно это 1–2 дня.",
    classes: (
      <>
        <span>Выберите занятие, которое вам подходит, и откликнитесь.</span>
        <Button onClick={() => navigate("/opportunities")}>Куда пойти</Button>
      </>
    ),
  };

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold">Ваш путь в фонде</h2>
      {v.status === "paused" && (
        <p className="rounded-2xl bg-page px-4 py-3">Сейчас вы на паузе. Когда будете готовы вернуться — напишите координатору.</p>
      )}
      <ol className="flex flex-col">
        {keys.map((k, i) => {
          const isCurrent = k === current;
          const last = i === keys.length - 1;
          return (
            <li key={k} className="flex gap-4" aria-current={isCurrent ? "step" : undefined}>
              <div className="flex flex-col items-center">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold ${
                    done[k] ? "bg-accent text-white" : isCurrent ? `${STEP_COLORS[i]} ring-4 ring-soft` : "border-2 border-line bg-page text-hint"
                  }`}
                >
                  {done[k] ? "✓" : i + 1}
                </span>
                {!last && <span className={`w-1 flex-1 rounded-full ${done[k] ? "bg-accent" : "bg-line"}`} aria-hidden="true" />}
              </div>
              <div className={`flex min-w-0 flex-1 flex-col gap-2 ${last ? "" : "pb-5"} pt-1.5`}>
                <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-lg leading-tight ${isCurrent ? "font-display font-semibold" : done[k] ? "font-medium" : "text-hint"}`}>
                  {STEP_TITLE[k]}
                  {done[k] && <span className="sr-only"> — пройдено</span>}
                  {isCurrent && <span className="rounded-full bg-soft px-2.5 py-0.5 font-sans text-sm font-semibold">сейчас</span>}
                </span>
                {isCurrent && hint[k] && <div className="flex flex-col items-start gap-3 text-hint">{hint[k]}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {!current && <p className="text-lg">Вы прошли весь путь — спасибо, что вы с нами! 🧡</p>}
    </Card>
  );
}
