// Переписка фонда с волонтёром (T-100) глазами координатора (/admin/messages). У волонтёра та же переписка
// разложена по чатам — screens/volunteer/Messages.tsx, оттуда же берёт пузырь сообщения и время.
// Упрощённый чат из Yapp: новые сообщения сайт спрашивает раз в несколько секунд, без WebSocket.
// Enter — отправить, Shift+Enter — новая строка.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { Dialog, Message, Sender } from "../api";
import { backend } from "../backend";
import { Button, ErrorBox, errorText, inputClass, Loading } from "../ui";

export const POLL_MS = 5000;
export const MAX_LENGTH = 1000;
/** Событие «переписку прочитали» — значки непрочитанных в меню обновляются сразу, не дожидаясь опроса. */
export const READ_EVENT = "messages-read";

/** Сообщение «о занятии …»: волонтёр нажал «Написать координатору» на карточке занятия (или координатор — у участника). */
export type About = { id: number; title: string };

export default function Thread(props: {
  volunteerId: number;
  reader: Sender;
  about?: About | null;
  /** после «прочитано» и после отправки — чтобы список переписок обновился сразу */
  onChange?: () => void;
}) {
  const { volunteerId, reader } = props;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  // о каком занятии ответ: undefined — как в последнем сообщении (у волонтёра ответ попадёт в тот же чат),
  // null — координатор убрал тему крестиком
  const [topic, setTopic] = useState<About | null | undefined>(props.about ?? undefined);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;

  async function load() {
    try {
      const d = await backend.dialog(volunteerId, reader);
      setDialog(d);
      setError("");
      if (d.unread > 0) {
        await backend.markRead(volunteerId, reader);
        window.dispatchEvent(new Event(READ_EVENT));
        onChange.current?.();
      }
    } catch (e) {
      setError(errorText(e));
    }
  }

  // при открытии и потом раз в 5 секунд; пока вкладка скрыта — не спрашиваем
  useEffect(() => {
    setDialog(null);
    load();
    const timer = setInterval(() => !document.hidden && load(), POLL_MS);
    return () => clearInterval(timer);
  }, [volunteerId, reader]);

  useEffect(() => setTopic(props.about ?? undefined), [props.about?.id]);

  const last = dialog?.messages.at(-1);
  const about =
    topic !== undefined ? topic : last?.opportunity_id ? { id: last.opportunity_id, title: last.opportunity_title ?? "…" } : null;

  // новое сообщение — прокручиваем вниз
  const count = dialog?.messages.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setSendError("");
    try {
      const m = await backend.sendMessage(volunteerId, { sender: reader, text, opportunity_id: about?.id ?? null });
      setDialog((d) => d && { ...d, messages: [...d.messages, m] });
      setText("");
      setTopic(undefined);
      onChange.current?.();
    } catch (err) {
      setSendError(`Не отправилось: ${errorText(err)}`);
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  if (!dialog && error) return <ErrorBox text={error} onRetry={load} />;
  if (!dialog) return <Loading />;

  const other = reader === "volunteer" ? "Координатор фонда" : dialog.volunteer.name.split(" ")[0];
  // «прочитано» — под последним своим сообщением, если собеседник до него дочитал
  const lastMine = [...dialog.messages].reverse().find((m) => m.sender === reader);

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={listRef}
        className="flex max-h-[60vh] min-h-48 flex-col gap-3 overflow-y-auto rounded-3xl bg-surface p-3 sm:p-4"
        aria-live="polite"
      >
        {dialog.messages.length === 0 ? (
          <p className="m-auto max-w-[36ch] py-8 text-center text-hint">
            {reader === "volunteer"
              ? "Здесь будет переписка с координатором фонда. Есть вопрос — напишите, вам ответят."
              : "Вы ещё не переписывались. Напишите первым — волонтёр увидит сообщение в личном кабинете."}
          </p>
        ) : (
          dialog.messages.map((m, i) => (
            <Bubble
              key={m.id}
              m={m}
              mine={m.sender === reader}
              name={other}
              // имя собеседника — только над первым сообщением подряд
              showName={m.sender !== reader && dialog.messages[i - 1]?.sender !== m.sender}
              read={m.id === lastMine?.id && dialog.their_read_id >= m.id}
            />
          ))
        )}
      </div>
      {error && <p className="text-sm text-hint">⚠️ {error} Пробуем ещё раз…</p>}

      <form onSubmit={send} className="flex flex-col gap-2">
        {about && (
          <p className="flex items-center gap-2 self-start rounded-full bg-soft py-1 pr-1 pl-4 font-medium">
            О занятии «{about.title}»
            <button
              type="button"
              onClick={() => setTopic(null)}
              aria-label="Не привязывать сообщение к занятию"
              className="flex size-8 items-center justify-center rounded-full hover:bg-page"
            >
              ✕
            </button>
          </p>
        )}
        <label className="sr-only" htmlFor={`message-${volunteerId}`}>
          Сообщение
        </label>
        <textarea
          id={`message-${volunteerId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder={reader === "volunteer" ? "Напишите координатору…" : "Напишите сообщение…"}
          className={`${inputClass} resize-none text-lg`}
        />
        {sendError && <ErrorBox text={sendError} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-hint">Enter — отправить, Shift+Enter — новая строка</span>
          <Button type="submit" loading={sending} disabled={!text.trim()}>
            Отправить
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Пузырь сообщения. inChat — в чате одного занятия у волонтёра: подпись «О занятии …» не нужна,
 *  а день написан над сообщениями, поэтому под пузырём — только время. */
export function Bubble(props: { m: Message; mine: boolean; name: string; showName: boolean; read: boolean; inChat?: boolean }) {
  const { m, mine } = props;
  return (
    <div className={`bubble-in flex max-w-[85%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`}>
      {props.showName && <span className="px-2 text-sm font-semibold text-hint">{props.name}</span>}
      <div
        className={`rounded-3xl px-4 py-2.5 text-lg leading-snug break-words whitespace-pre-wrap ${
          mine ? "rounded-br-lg bg-accent text-accent-text" : "rounded-bl-lg bg-page shadow-sm"
        }`}
      >
        {m.opportunity_title && !props.inChat && (
          <span className={`mb-1 block text-sm font-semibold ${mine ? "text-accent-text/85" : "text-hint"}`}>
            О занятии «{m.opportunity_title}»
          </span>
        )}
        {m.text}
      </div>
      <span className="px-2 text-sm text-hint">
        {props.inChat ? timeOf(m.created_at) : when(m.created_at)}
        {props.read && " · ✓ прочитано"}
      </span>
    </div>
  );
}

/** «18:05» — сегодня, «21 окт., 18:05» — раньше. */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = timeOf(iso);
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString("ru", { day: "numeric", month: "short" })}, ${time}`;
}

/** «18:05». */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

/** Сколько новых сообщений: у волонтёра — от координатора, у фонда — во всех переписках. Для значков в меню. */
export function useUnread(volunteerId: number | null, reader: Sender, pollMs = 20000): number {
  const [unread, setUnread] = useState(0);
  async function load() {
    try {
      if (reader === "coordinator") setUnread((await backend.dialogs()).reduce((n, d) => n + d.unread, 0));
      else if (volunteerId) setUnread((await backend.dialog(volunteerId, "volunteer")).unread);
    } catch {
      /* значок не главное — оставляем прежнее число */
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(() => !document.hidden && load(), pollMs);
    window.addEventListener(READ_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(READ_EVENT, load);
    };
  }, [volunteerId, reader]);
  return unread;
}

/** Круглый значок с числом новых. */
export function UnreadBadge(props: { count: number }) {
  if (props.count <= 0) return null;
  return (
    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-cta px-1.5 text-sm leading-6 font-bold text-white">
      <span className="sr-only">новых: </span>
      {props.count > 99 ? "99+" : props.count}
    </span>
  );
}
