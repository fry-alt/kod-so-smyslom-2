// Личный кабинет волонтёра. Открывается сразу после регистрации — ещё до анкеты:
// уже видно, куда можно пойти, а первый шаг пути — «Заполнить анкету».
// Итог собеседования (оценка координатора) здесь не показываем — он только для фонда.
import { useEffect, useState, type ReactNode } from "react";

import type { Interview, Look, Opportunity, Participation, Volunteer } from "../../api";
import { accountName, backend, getAccount, getLook, getVolunteerId, loadLook, logout, setVolunteerId } from "../../backend";
import { FORMAT, REGION, STATUS, STATUS_COLOR } from "../../labels";
import { UnreadBadge, useUnread } from "../../messages/Thread";
import { navigate } from "../../router";
import { Badge, Button, ButtonLink, Card, ErrorBox, FLAIR, flairHandlers, formatHours, Link, Loading, useLoad } from "../../ui";
import { Avatar, COVERS, Cover, LookEditor, type Progress } from "./Look";

export default function Me() {
  const account = getAccount();
  const id = getVolunteerId();
  const { data: v, error, loading, reload } = useLoad(
    () => (id ? backend.get(id) : Promise.resolve(null)),
    [id],
  );
  const { data: mine } = useLoad(
    () => (id ? backend.myParticipations(id) : Promise.resolve([])),
    [id],
  );
  const { data: interviews } = useLoad(
    () => (id ? backend.interviews(id) : Promise.resolve([])),
    [id],
  );
  // приглашения координатора — показываем сверху, чтобы не пропустить
  const invites = mine?.filter((p) => p.status === "invited") ?? [];
  const call = nextCall(interviews ?? []);
  const unread = useUnread(id, "volunteer");
  // оформление: сразу из копии на устройстве, потом — свежее с сервера
  const [look, setLook] = useState<Look>(getLook);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    loadLook().then(setLook, () => {
      /* не загрузилось — остаётся копия с устройства */
    });
  }, []);

  if (id && loading) return <Loading />;
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

  const attended = (mine ?? []).filter((p) => p.status === "attended").length;
  // имя из анкеты, а пока анкеты нет — то, что человек написал при регистрации
  const firstName = (v?.name || account?.name || "").trim().split(" ")[0] || null;
  const progress: Progress = {
    hasForm: !!v,
    trained: !!v && ["trained", "approved", "active"].includes(v.status),
    attended,
    hours: v?.hours ?? 0,
  };
  const letter = (look.nickname || firstName || accountName(account) || "?")[0].toUpperCase();

  return (
    <div className="flex flex-col gap-6 pb-6">
      <LookEditor
        open={editing}
        look={look}
        letter={letter}
        name={firstName}
        progress={progress}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setLook(saved);
          setEditing(false);
        }}
      />
      <Hero
        name={look.nickname || firstName}
        look={look}
        letter={letter}
        onEdit={() => setEditing(true)}
        badge={v ? <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge> : null}
        stats={
          v
            ? [
                { value: formatHours(v.hours), label: "часов помощи" },
                { value: v.training_score === null ? "—" : `${v.training_score}%`, label: "балл за обучение" },
                { value: String(attended), label: attended === 1 ? "занятие" : "занятий" },
              ]
            : null
        }
      />

      {!v && <StartCard />}
      {v && <NextStepCard volunteer={v} interviews={interviews ?? undefined} />}
      {call && <CallCard i={call} />}
      {unread > 0 && (
        <section className="flex flex-col gap-3 rounded-[1.75rem] bg-soft p-5 ring-2 ring-accent sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-semibold">
            📨 Координатор написал вам{unread > 1 ? ` — новых сообщений: ${unread}` : ""}
          </p>
          <ButtonLink to="/messages">Прочитать и ответить</ButtonLink>
        </section>
      )}
      {invites.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[1.75rem] bg-pop/25 p-5 ring-2 ring-pop sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-semibold">
            📩 Вас пригласили: {invites.map((p) => `«${p.opportunity_title}»`).join(", ")}
          </p>
          <ButtonLink to="/opportunities">Посмотреть и подтвердить</ButtonLink>
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Events volunteerId={id} />
          <Path v={v ?? null} interviews={interviews ?? []} participations={mine ?? []} upcoming={call} />
        </div>
        <aside className="flex flex-col gap-6">
          {v?.profile && (v.profile.skills.length > 0 || v.profile.interests.length > 0) && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold">Что мы о вас поняли</h2>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...v.profile.skills, ...v.profile.interests])].map((s) => (
                  <Badge key={s} className="bg-page">
                    {s}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
          <QuickActions hasForm={!!v} unread={unread} />
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/");
            }}
            {...flairHandlers}
            className={`btn-flair min-h-12 self-start rounded-full px-4 font-semibold text-hint ${FLAIR.secondary}`}
          >
            Выйти из кабинета
          </button>
        </aside>
      </div>
    </div>
  );
}

// ===== Шапка кабинета =====

function Hero(props: {
  name: string | null;
  look: Look;
  letter: string;
  onEdit: () => void;
  badge: ReactNode;
  stats: { value: string; label: string }[] | null;
}) {
  const dark = COVERS[props.look.cover]?.dark;
  return (
    <Cover cover={props.look.cover} className="rounded-[2rem] p-5 sm:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <button type="button" onClick={props.onEdit} aria-label="Оформить кабинет" className="rounded-full transition hover:scale-105">
            <Avatar look={props.look} letter={props.letter} />
          </button>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="font-display text-[1.7rem] leading-tight font-semibold tracking-tight sm:text-[2.2rem]">
              {props.name ? `Здравствуйте, ${props.name}!` : "Добро пожаловать!"}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {props.badge}
              <button
                type="button"
                onClick={props.onEdit}
                className={`flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap backdrop-blur-sm transition hover:scale-105 ${
                  dark ? "bg-white/15 hover:bg-white/25" : "bg-page/80 hover:bg-page"
                }`}
              >
                <span aria-hidden="true">🎨</span> Оформить кабинет
              </button>
            </div>
          </div>
        </div>
        {props.stats && (
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {props.stats.map((s) => (
              <div
                key={s.label}
                className={`flex flex-col rounded-2xl px-3 py-3 backdrop-blur-sm sm:min-w-28 sm:px-4 ${dark ? "bg-white/12" : "bg-page/85"}`}
              >
                <dt className="order-2 text-sm leading-tight text-hint hyphens-auto">{s.label}</dt>
                {/* цифры — Onest: в Unbounded ноль похож на букву «О» */}
                <dd className="order-1 text-2xl font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Cover>
  );
}

/** До анкеты: крупно — первый шаг. */
function StartCard() {
  return (
    <section className="flex flex-col gap-4 rounded-[1.75rem] border-2 border-cta/30 bg-page p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-cta">Первый шаг</span>
        <h2 className="font-display text-xl leading-snug font-semibold sm:text-2xl">Расскажите о себе в анкете</h2>
        <p className="text-hint">
          Так координатор подберёт вам занятия по душе и пригласит на знакомство. Займёт 5–7 минут.
        </p>
      </div>
      <Link
        to="/form"
        className={`inline-flex min-h-14 shrink-0 items-center justify-center rounded-full bg-cta px-8 text-lg font-bold whitespace-nowrap text-white no-underline shadow-[0_8px_24px_-8px_var(--p-cta)] transition hover:brightness-95 ${FLAIR.cta}`}
      >
        Заполнить анкету
      </Link>
    </section>
  );
}

/** После анкеты главный следующий шаг держим вверху кабинета, а не только в длинной шкале пути. */
function NextStepCard(props: { volunteer: Volunteer; interviews: Interview[] | undefined }) {
  const { volunteer, interviews } = props;
  if (volunteer.status === "paused" || volunteer.status === "active") return null;

  let title: string;
  let detail: string;
  let action: { label: string; path: string } | null = null;

  if (volunteer.status === "new" || volunteer.status === "training") {
    title = volunteer.status === "training" ? "Продолжите обучение" : "Пройдите короткое обучение";
    detail = "Это следующий шаг после анкеты. В конце каждого обязательного раздела будет небольшой тест.";
    action = { label: volunteer.status === "training" ? "Продолжить обучение" : "Пройти обучение", path: "/training" };
  } else if (volunteer.status === "trained") {
    if (!interviews) return null;
    const interviewed = interviews.some((interview) => interview.status === "done");
    title = interviewed ? "Дождитесь решения координатора" : "Запишитесь на собеседование";
    detail = interviewed
      ? "Координатор посмотрит итоги встречи и сообщит, когда можно будет присоединиться к занятиям."
      : "На коротком видеозвонке вы познакомитесь с координатором и сможете задать вопросы.";
    if (!interviewed) action = { label: "Выбрать время", path: "/interview" };
  } else if (volunteer.status === "approved") {
    title = "Вы допущены к занятиям";
    detail = "Посмотрите открытые занятия и выберите, куда хотите присоединиться.";
    action = { label: "Выбрать занятие", path: "/opportunities" };
  } else {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-[1.75rem] border-2 border-accent/30 bg-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-link">Следующий шаг</span>
        <h2 className="font-display text-xl leading-snug font-semibold">{title}</h2>
        <p className="text-hint">{detail}</p>
      </div>
      {action && <ButtonLink variant="primary" to={action.path}>{action.label}</ButtonLink>}
    </section>
  );
}

// ===== Куда можно пойти =====

function Events(props: { volunteerId: number | null }) {
  const { data } = useLoad(() => backend.opportunities(props.volunteerId ?? undefined), [props.volunteerId]);
  if (!data) return null;
  const now = Date.now();
  // подходящие под анкету — первыми, дальше по дате
  const list = data
    .filter((o) => new Date(o.starts_at).getTime() > now && (o.slots - o.taken > 0 || o.my_status))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold">Куда можно пойти</h2>
        <Link to="/opportunities" className="font-semibold text-link hover:underline">
          Все занятия →
        </Link>
      </div>
      {list.length === 0 ? (
        <Card>
          <p className="text-hint">Сейчас открытых занятий нет. Координатор добавит новые — они появятся здесь.</p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((o) => (
            <li key={o.id}>
              <EventCard o={o} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MY_STATUS: Record<NonNullable<Opportunity["my_status"]>, string> = {
  responded: "Вы откликнулись",
  invited: "Вас пригласили",
  confirmed: "✓ Вы записаны",
  attended: "✓ Вы участвовали",
  declined: "Вы отказались",
};

function EventCard({ o }: { o: Opportunity }) {
  const d = new Date(o.starts_at);
  const left = o.slots - o.taken;
  return (
    <Link
      to="/opportunities"
      className="lift flex h-full w-full gap-4 rounded-3xl border-2 border-line bg-page p-4 text-left hover:border-accent"
    >
      <span className="flex w-16 shrink-0 flex-col items-center rounded-2xl bg-soft py-2">
        <span className="font-display text-2xl leading-none font-semibold">{d.getDate()}</span>
        <span className="text-sm">{d.toLocaleDateString("ru", { month: "short" }).replace(".", "")}</span>
        <span className="text-sm text-hint">{d.toLocaleDateString("ru", { weekday: "short" })}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-lg leading-snug font-semibold">{o.title}</span>
        <span className="text-hint">
          {d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })},{" "}
          {o.format === "online" ? FORMAT.online.toLowerCase() : o.place || REGION[o.region]}
        </span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          {o.my_status ? (
            <span className="rounded-full bg-soft px-3 py-0.5 text-sm font-semibold">{MY_STATUS[o.my_status]}</span>
          ) : (
            <span className="rounded-full bg-pop px-3 py-0.5 text-sm font-semibold">
              {left === 1 ? "Нужен ещё 1 человек" : `Нужно ещё ${left} человек${left < 5 ? "а" : ""}`}
            </span>
          )}
          {o.recommended && !o.my_status && (
            <span className="rounded-full bg-accent px-3 py-0.5 text-sm font-semibold text-accent-text">Вам подходит</span>
          )}
        </span>
      </span>
    </Link>
  );
}

// ===== Быстрые действия =====

function QuickActions(props: { hasForm: boolean; unread: number }) {
  const items = [
    { icon: "📹", title: "Собеседование", sub: "Запись на видеозвонок с координатором", to: "/interview" },
    { icon: "📨", title: "Сообщения", sub: "Переписка с координатором фонда", to: "/messages", needsForm: true, unread: props.unread },
    { icon: "🎓", title: "Обучение", sub: "Курс и тест перед занятиями", to: "/training" },
    { icon: "⏱", title: "История и часы", sub: "Где вы были и сколько помогли", to: "/history", needsForm: true },
    { icon: "💬", title: "Спросить о фонде", sub: "Ответим по документам фонда", to: "/ask" },
  ].filter((i) => props.hasForm || !i.needsForm);
  return (
    <nav aria-label="Разделы кабинета" className="flex flex-col gap-3">
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          className="lift flex items-center gap-4 rounded-3xl bg-surface p-4 text-left"
        >
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-page text-2xl">
            {i.icon}
          </span>
          <span className="flex flex-col">
            <span className="flex items-center gap-2 font-semibold">
              {i.title}
              {"unread" in i && <UnreadBadge count={i.unread ?? 0} />}
            </span>
            <span className="text-sm leading-snug text-hint">{i.sub}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

// ===== Видеособеседование =====

/** Ближайшее назначенное собеседование. Опоздавшего ещё пускаем: звонок виден 2 часа после начала. */
export function nextCall(list: Interview[]): Interview | null {
  const from = Date.now() - 2 * 3600_000;
  return (
    list
      .filter((i) => i.status === "scheduled" && new Date(i.starts_at).getTime() >= from)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null
  );
}

/** «22 октября в 15:00». */
export function callWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("ru", { day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return `${day} в ${time}`;
}

function CallCard({ i }: { i: Interview }) {
  return (
    <section className="flex flex-col gap-4 rounded-[1.75rem] bg-logo-blue p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-white/80">📹 Видеособеседование с координатором</span>
        <span className="font-display text-2xl font-semibold">{callWhen(i.starts_at)}</span>
        <span className="text-white/80">Перед входом вы увидите себя и проверите микрофон.</span>
      </div>
      <button
        type="button"
        onClick={() => navigate(`/call/${encodeURIComponent(i.token)}`)}
        {...flairHandlers}
        className={`btn-flair min-h-14 shrink-0 rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] ${FLAIR.cta}`}
      >
        Войти в звонок
      </button>
    </section>
  );
}

// ===== Путь в фонде =====

// порядок шагов — порядок ключей: сначала обучение, потом собеседование
type StepKey = "form" | "training" | "interview" | "approval" | "classes";
const STEP_TITLE: Record<StepKey, string> = {
  form: "Анкета",
  training: "Обучение",
  interview: "Собеседование",
  approval: "Допуск",
  classes: "Занятия",
};
/** Цвет текущего шага — цвета букв логотипа; на светлых (голубой, жёлтый) цифра тёмная. */
const STEP_COLORS = ["bg-logo-blue text-white", "bg-logo-berry text-white", "bg-logo-cyan text-ink", "bg-pop text-ink", "bg-accent text-white"];

/** Шаги пути: пройденные — с галочкой, текущий — крупно и с подсказкой, что делать. Без анкеты текущий — «Анкета». */
function Path(props: { v: Volunteer | null; interviews: Interview[]; participations: Participation[]; upcoming: Interview | null }) {
  const { v } = props;
  const later = (...s: Volunteer["status"][]) => !!v && s.includes(v.status);
  const done: Record<StepKey, boolean> = {
    form: !!v,
    training: later("trained", "approved", "active"),
    // до видеособеседований на сайте знакомились без системы — поэтому допуск тоже значит «собеседование было»
    interview: props.interviews.some((i) => i.status === "done") || later("approved", "active"),
    approval: later("approved", "active"),
    classes: later("active") || props.participations.some((p) => p.status === "attended"),
  };
  const keys = Object.keys(STEP_TITLE) as StepKey[];
  const current = keys.find((k) => !done[k]) ?? null;

  const hint: Record<StepKey, ReactNode> = {
    form: "Расскажите о себе: что умеете, когда свободны, чем хотите помогать. Кнопка «Заполнить анкету» — выше.",
    interview: props.upcoming ? (
      `Назначено на ${callWhen(props.upcoming.starts_at)}. Кнопка «Войти в звонок» — выше.`
    ) : (
      <>
        <span>Короткий видеозвонок с координатором — 30 минут. Выберите удобное время сами.</span>
        <ButtonLink to="/interview">Записаться на собеседование</ButtonLink>
      </>
    ),
    training: (
      <>
        <span>Короткий курс о наших подопечных и правилах фонда, в конце — тест.</span>
        <ButtonLink to="/training">{v?.status === "training" ? "Продолжить обучение" : "Пройти обучение"}</ButtonLink>
      </>
    ),
    approval: "Координатор посмотрит результаты и допустит вас к занятиям. Обычно это 1–2 дня.",
    classes: (
      <>
        <span>Выберите занятие, которое вам подходит, и откликнитесь.</span>
        <ButtonLink to="/opportunities">Куда пойти</ButtonLink>
      </>
    ),
  };

  return (
    <Card className="flex flex-col gap-4 sm:p-6">
      <h2 className="font-display text-2xl font-semibold">Ваш путь в фонде</h2>
      {v?.status === "paused" && (
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
                {isCurrent && <div className="flex flex-col items-start gap-3 text-hint">{hint[k]}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {!current && <p className="text-lg">Вы прошли весь путь — спасибо, что вы с нами! 🧡</p>}
    </Card>
  );
}
