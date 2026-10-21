// Собеседование: волонтёр сам выбирает день и время видеозвонка с координатором,
// видит свою запись, может перенести или отменить её и войти в звонок.
// Свободное время отдаёт бэкенд (будни 10:00–18:00 по Москве, занятое не показывается).
import { useState } from "react";

import type { Interview as InterviewT } from "../../api";
import { backend, getVolunteerId } from "../../backend";
import { navigate } from "../../router";
import { tg } from "../../telegram";
import { Button, Card, ErrorBox, errorText, FLAIR, flairHandlers, Loading, useLoad } from "../../ui";
import { callWhen, nextCall } from "./Me";

export default function Interview() {
  const id = getVolunteerId();
  const { data: list, error, loading, reload } = useLoad(
    () => (id ? backend.interviews(id) : Promise.resolve([])),
    [id],
  );
  const [notice, setNotice] = useState("");

  const upcoming = nextCall(list ?? []);
  const passed = (list ?? []).some((i) => i.status === "done");

  function done(text: string) {
    setNotice(text);
    reload();
    window.scrollTo(0, 0);
  }

  let main;
  if (!id) main = <NeedForm />;
  else if (loading && !list) main = <Loading />;
  else if (error) main = <ErrorBox text={error} onRetry={reload} />;
  else if (upcoming) main = <Booked i={upcoming} onChange={done} />;
  else if (passed) main = <Passed />;
  else main = <SlotPicker volunteerId={id} onBooked={done} />;

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => navigate("/me")} className="self-start font-semibold text-link hover:underline">
          ← Личный кабинет
        </button>
        <h1 className="font-display text-[1.65rem] leading-tight font-semibold tracking-tight sm:text-[2rem] md:text-[2.4rem]">Собеседование</h1>
        <p className="max-w-[52ch] text-lg text-hint">
          Короткий видеозвонок с координатором фонда — 30 минут. Познакомимся, расскажем о занятиях и ответим на ваши
          вопросы. Это не экзамен.
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-2xl bg-green-100 px-4 py-3 text-lg text-green-900">
          {notice}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">{main}</div>
        <Prepare />
      </div>
    </div>
  );
}

function NeedForm() {
  return (
    <Card className="flex flex-col items-start gap-3 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Сначала — анкета</h2>
      <p className="text-hint">По анкете координатор подготовится к разговору. Займёт 5–7 минут.</p>
      <Button onClick={() => navigate("/form")}>Заполнить анкету</Button>
    </Card>
  );
}

/** Пройдено — дальше обучение. */
function Passed() {
  return (
    <Card className="flex flex-col items-start gap-3 sm:p-6">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-2xl text-white" aria-hidden="true">
        ✓
      </span>
      <h2 className="font-display text-xl font-semibold">Собеседование пройдено</h2>
      <p className="text-hint">Спасибо за разговор! Следующий шаг — короткое обучение о наших подопечных и правилах фонда.</p>
      <Button onClick={() => navigate("/training")}>Перейти к обучению</Button>
    </Card>
  );
}

// ===== Запись есть =====

/** «сегодня», «завтра», «через 3 дня». */
function inDays(iso: string): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((day(new Date(iso)) - day(new Date())) / 86_400_000);
  if (n <= 0) return "сегодня";
  if (n === 1) return "завтра";
  const word = n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней";
  return `через ${n} ${word}`;
}

function Booked(props: { i: InterviewT; onChange: (notice: string) => void }) {
  const { i } = props;
  const [busy, setBusy] = useState<"" | "move" | "cancel">("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");

  async function cancel(kind: "move" | "cancel") {
    setBusy(kind);
    setError("");
    try {
      await backend.updateInterview(i.id, "canceled");
      props.onChange(kind === "move" ? "Старая запись отменена — выберите новое время." : "Запись отменена. Можно выбрать другое время, когда будет удобно.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="relative flex flex-col gap-5 overflow-hidden rounded-[2rem] bg-logo-blue p-6 text-white sm:p-8">
      <span aria-hidden="true" className="auth-blob auth-blob-2" />
      <div className="relative flex flex-col gap-1">
        <span className="font-semibold text-white/80">📹 Вы записаны · {inDays(i.starts_at)}</span>
        <span className="font-display text-[1.9rem] leading-tight font-semibold sm:text-[2.4rem]">{callWhen(i.starts_at)}</span>
        <span className="text-white/85">
          {i.notified
            ? "Ссылку на звонок мы прислали и в Telegram."
            : "Ссылка на звонок — кнопка ниже, она будет здесь и в день собеседования."}
        </span>
      </div>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={() => navigate(`/call/${encodeURIComponent(i.token)}`)}
          {...flairHandlers}
          className={`btn-flair min-h-14 rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] ${FLAIR.cta}`}
        >
          Войти в звонок
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => cancel("move")}
          className="min-h-12 rounded-full border-2 border-white/40 px-6 font-semibold hover:border-white disabled:opacity-60"
        >
          {busy === "move" ? "Секунду…" : "Перенести"}
        </button>
        {!confirmCancel ? (
          <button type="button" onClick={() => setConfirmCancel(true)} className="min-h-12 rounded-full px-4 font-semibold text-white/80 hover:text-white">
            Отменить запись
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/15 px-4 py-2">
            Точно отменить?
            <button
              type="button"
              disabled={!!busy}
              onClick={() => cancel("cancel")}
              className="min-h-10 rounded-full bg-white px-4 font-semibold text-ink disabled:opacity-60"
            >
              {busy === "cancel" ? "Отменяем…" : "Да, отменить"}
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} className="min-h-10 px-2 font-semibold">
              Нет
            </button>
          </span>
        )}
      </div>
      {error && <ErrorBox text={error} />}
    </section>
  );
}

// ===== Выбор времени =====

const dayKey = (iso: string) => iso.slice(0, 10);

function SlotPicker(props: { volunteerId: number; onBooked: (notice: string) => void }) {
  const { data, error, loading, reload } = useLoad(backend.interviewSlots);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [bookError, setBookError] = useState("");

  if (loading && !data) return <Loading text="Смотрим свободное время…" />;
  if (error) return <ErrorBox text={error} onRetry={reload} />;
  if (!data) return null;

  const byDay = new Map<string, string[]>();
  for (const s of data.slots) byDay.set(dayKey(s), [...(byDay.get(dayKey(s)) ?? []), s]);
  const days = [...byDay.keys()];
  const current = day && byDay.has(day) ? day : (days[0] ?? null);

  if (!current) {
    return (
      <Card className="sm:p-6">
        <p className="text-lg">Свободного времени на ближайшие две недели нет. Загляните завтра или напишите координатору.</p>
      </Card>
    );
  }

  async function book() {
    if (!time) return;
    setSending(true);
    setBookError("");
    try {
      const i = await backend.bookInterview(props.volunteerId, time);
      tg?.HapticFeedback?.impactOccurred("medium");
      props.onBooked(`Готово! Вы записаны на ${callWhen(i.starts_at)}.`);
    } catch (e) {
      setBookError(errorText(e));
      reload(); // время могли занять — показываем свежее
      setTime(null);
    } finally {
      setSending(false);
    }
  }

  const times = byDay.get(current) ?? [];
  return (
    <Card className="flex flex-col gap-6 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold">Выберите день</h2>
        <p className="text-hint">Время московское. Собеседование длится {data.minutes} минут.</p>
      </div>

      <div role="radiogroup" aria-label="День" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {days.map((d) => {
          const date = new Date(`${d}T12:00:00`);
          const on = d === current;
          const n = byDay.get(d)!.length;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${date.toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" })}, свободно ${n}`}
              onClick={() => {
                setDay(d);
                setTime(null);
              }}
              className={`flex w-20 shrink-0 snap-start flex-col items-center rounded-2xl border-2 py-2.5 transition ${
                on ? "border-accent bg-accent text-accent-text" : "border-line bg-page hover:border-accent"
              }`}
            >
              <span className={`text-sm ${on ? "" : "text-hint"}`}>{date.toLocaleDateString("ru", { weekday: "short" })}</span>
              <span className="font-display text-2xl leading-tight font-semibold">{date.getDate()}</span>
              <span className="text-sm">{date.toLocaleDateString("ru", { month: "short" }).replace(".", "")}</span>
              <span className={`mt-1 text-xs ${on ? "" : "text-hint"}`}>{n} своб.</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Время</h2>
        <div role="radiogroup" aria-label="Время" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {times.map((t) => {
            const on = t === time;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTime(t)}
                className={`min-h-12 rounded-full border-2 font-semibold transition ${
                  on ? "border-accent bg-accent text-accent-text" : "border-line bg-page hover:border-accent"
                }`}
              >
                {t.slice(11, 16)}
              </button>
            );
          })}
        </div>
      </div>

      {bookError && <ErrorBox text={bookError} />}

      <div className="flex flex-col gap-3 rounded-3xl bg-page p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg">
          {time ? (
            <>
              Вы выбрали: <b>{callWhen(time)}</b>
            </>
          ) : (
            <span className="text-hint">Выберите удобное время</span>
          )}
        </p>
        <button
          type="button"
          disabled={!time || sending}
          onClick={book}
          {...flairHandlers}
          className={`btn-flair min-h-14 shrink-0 rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] disabled:opacity-50 ${FLAIR.cta}`}
        >
          {sending ? "Записываем…" : "Записаться"}
        </button>
      </div>
    </Card>
  );
}

// ===== Подсказки =====

function Prepare() {
  return (
    <aside className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">Как подготовиться</h2>
        <ul className="flex flex-col gap-2.5">
          {[
            ["🎧", "Телефон или компьютер с камерой и микрофоном"],
            ["🤫", "Тихое место на полчаса"],
            ["🔗", "Ничего устанавливать не нужно — звонок откроется прямо здесь"],
            ["🙂", "Перед входом вы увидите себя и проверите звук"],
          ].map(([icon, text]) => (
            <li key={text} className="flex gap-3">
              <span aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">О чём поговорим</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-hint">
          <li>Почему вы хотите помогать</li>
          <li>Когда вам удобно приходить</li>
          <li>Есть ли опыт с детьми или людьми с особенностями</li>
          <li>Ваши вопросы о фонде и занятиях</li>
        </ul>
      </Card>
    </aside>
  );
}
