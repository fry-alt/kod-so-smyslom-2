// «Сообщения» в личном кабинете волонтёра — как мессенджер: слева чаты, справа открытый чат.
// Чат «Координатор фонда» — для любых вопросов, остальные — по одному на каждый отклик (занятие).
// Переписка с фондом одна (T-100): чаты — это её сообщения, разложенные по пометке «о занятии …».
// Открытый чат — в адресе: /messages?about=<id занятия> (так ведёт «Написать координатору» с карточки)
// или /messages?about=fund. На телефоне видно что-то одно: список или чат.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { Dialog, Message, Opportunity, Participation, ParticipationStatus } from "../../api";
import { backend, getVolunteerId } from "../../backend";
import { PARTICIPATION_COLOR } from "../../labels";
import { Bubble, MAX_LENGTH, POLL_MS, READ_EVENT, timeOf, UnreadBadge } from "../../messages/Thread";
import { navigate, useSearchParam } from "../../router";
import { Button, ErrorBox, errorText, formatWhen, Link, Loading, useLoad } from "../../ui";

const FUND = "fund";

/** Статус отклика словами волонтёра — в шапке чата. */
const STATUS: Record<ParticipationStatus, string> = {
  responded: "Вы откликнулись",
  invited: "Вас приглашают",
  confirmed: "Вы записаны",
  attended: "Вы участвовали",
  declined: "Вы отказались",
};

/** С чего начать разговор — по нажатию текст попадает в поле, его можно поправить. */
const SUGGEST = {
  fund: ["Как проходит собеседование?", "Чем я могу помочь фонду?", "Можно помогать онлайн?"],
  opportunity: ["Что взять с собой?", "Как добраться?", "Можно прийти с другом?"],
};

type Chat = {
  key: string; // FUND или id занятия
  opportunityId: number | null;
  title: string;
  startsAt: string | null;
  status: ParticipationStatus | null;
  messages: Message[];
};

export default function Messages() {
  const id = getVolunteerId();
  if (!id) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-3xl bg-soft p-5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Сообщения</h1>
        <p className="text-lg">Чтобы написать координатору, сначала заполните анкету — это 5 минут.</p>
        <Button onClick={() => navigate("/form")}>Заполнить анкету</Button>
      </section>
    );
  }
  return <Messenger volunteerId={id} />;
}

function Messenger(props: { volunteerId: number }) {
  const { volunteerId } = props;
  const openKey = useSearchParam("about");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState("");
  // новые от координатора; гаснут, когда открыли их чат (на сервере «прочитано» — сразу на всю переписку)
  const [unread, setUnread] = useState<Set<number>>(new Set());
  const { data: extra } = useLoad(
    () => Promise.all([backend.myParticipations(volunteerId), backend.opportunities(volunteerId)]),
    [volunteerId],
  );

  async function load() {
    try {
      const d = await backend.dialog(volunteerId, "volunteer");
      setDialog(d);
      setError("");
      if (d.unread > 0) {
        const fresh = d.messages.filter((m) => m.sender === "coordinator").slice(-d.unread);
        setUnread((s) => new Set([...s, ...fresh.map((m) => m.id)]));
      }
    } catch (e) {
      setError(errorText(e));
    }
  }

  // при открытии и потом раз в 5 секунд; пока вкладка скрыта — не спрашиваем
  useEffect(() => {
    load();
    const timer = setInterval(() => !document.hidden && load(), POLL_MS);
    return () => clearInterval(timer);
  }, [volunteerId]);

  const chats = buildChats(dialog?.messages ?? [], extra?.[0] ?? [], extra?.[1] ?? [], openKey);
  const open = chats.find((c) => c.key === openKey) ?? null;

  // открыли чат с новыми сообщениями — отмечаем прочитанным
  const openUnread = open?.messages.filter((m) => unread.has(m.id)) ?? [];
  useEffect(() => {
    if (openUnread.length === 0) return;
    setUnread((s) => new Set([...s].filter((x) => !openUnread.some((m) => m.id === x))));
    backend
      .markRead(volunteerId, "volunteer")
      .then(() => window.dispatchEvent(new Event(READ_EVENT)))
      .catch(() => {
        /* не страшно: отметим при следующем открытии */
      });
  }, [open?.key, openUnread.length]);

  function sent(m: Message) {
    setDialog((d) => d && { ...d, messages: [...d.messages, m] });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Link to="/me" className={`self-start text-link underline-offset-4 hover:underline ${open ? "max-md:hidden" : ""}`}>
        ← В личный кабинет
      </Link>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-line bg-page shadow-[0_30px_60px_-45px_var(--p-ink)]">
        <aside className={`flex w-full flex-col md:w-80 md:shrink-0 md:border-r md:border-line lg:w-96 ${open ? "max-md:hidden" : ""}`}>
          <div className="px-5 pt-5 pb-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Сообщения</h1>
            <p className="text-hint">Вопросы фонду и ваши отклики</p>
          </div>
          <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
            {dialog && chats.map((c) => (
              <li key={c.key}>
                <ChatRow chat={c} active={c.key === open?.key} unread={c.messages.filter((m) => unread.has(m.id)).length} />
              </li>
            ))}
          </ul>
        </aside>

        <section className={`flex min-w-0 flex-1 flex-col ${open ? "" : "max-md:hidden"}`}>
          {!dialog && error ? (
            <div className="m-auto p-5">
              <ErrorBox text={error} onRetry={load} />
            </div>
          ) : !dialog ? (
            <div className="m-auto">
              <Loading />
            </div>
          ) : open ? (
            <ChatPane
              key={open.key}
              chat={open}
              volunteerId={volunteerId}
              theirReadId={dialog.their_read_id}
              error={error}
              onSent={sent}
            />
          ) : (
            <Placeholder />
          )}
        </section>
      </div>
    </div>
  );
}

/** Чаты: общий с координатором — всегда первым, дальше отклики — где свежее сообщение, те выше. */
function buildChats(messages: Message[], mine: Participation[], list: Opportunity[], openKey: string | null): Chat[] {
  const startsAt = (id: number) => list.find((o) => o.id === id)?.starts_at ?? null;
  const chat = (id: number, title: string, status: ParticipationStatus | null): Chat => ({
    key: String(id),
    opportunityId: id,
    title,
    startsAt: startsAt(id),
    status,
    messages: [],
  });
  const fund: Chat = { key: FUND, opportunityId: null, title: "Координатор фонда", startsAt: null, status: null, messages: [] };
  const byKey = new Map<string, Chat>();
  for (const p of mine) byKey.set(String(p.opportunity_id), chat(p.opportunity_id, p.opportunity_title, p.status));
  for (const m of messages) {
    if (m.opportunity_id === null) {
      fund.messages.push(m);
      continue;
    }
    const key = String(m.opportunity_id);
    if (!byKey.has(key)) byKey.set(key, chat(m.opportunity_id, m.opportunity_title ?? "Занятие", null));
    byKey.get(key)!.messages.push(m);
  }
  // пришли с карточки занятия, а отклика ещё не видно — всё равно открываем его чат
  const aboutId = Number(openKey);
  const about = list.find((o) => o.id === aboutId);
  if (about && !byKey.has(openKey!)) byKey.set(openKey!, chat(about.id, about.title, about.my_status));

  const lastAt = (c: Chat) => c.messages.at(-1)?.created_at ?? "";
  const rest = [...byKey.values()].sort(
    (a, b) => lastAt(b).localeCompare(lastAt(a)) || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""),
  );
  return [fund, ...rest];
}

function ChatRow(props: { chat: Chat; active: boolean; unread: number }) {
  const { chat, unread } = props;
  const last = chat.messages.at(-1);
  const preview = last
    ? (last.sender === "volunteer" ? "Вы: " : "") + last.text
    : chat.opportunityId
      ? chat.status
        ? STATUS[chat.status]
        : "Спросите о занятии"
      : "Задайте любой вопрос о фонде";
  return (
    <Link
      to={`/messages?about=${chat.key}`}
      className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition ${props.active ? "bg-soft" : "hover:bg-surface"}`}
    >
      <ChatAvatar chat={chat} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate ${unread > 0 ? "font-bold" : "font-semibold"}`}>{chat.title}</span>
          {last && <span className="shrink-0 text-sm text-hint">{shortWhen(last.created_at)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate ${unread > 0 ? "text-ink" : "text-hint"}`}>{preview}</span>
          <UnreadBadge count={unread} />
        </span>
      </span>
    </Link>
  );
}

/** Фонд — кружок с буквами «ДМ», занятие — листок календаря с датой, как на карточках занятий. */
function ChatAvatar(props: { chat: Chat; small?: boolean }) {
  const size = props.small ? "size-11" : "size-13";
  if (!props.chat.opportunityId) {
    return (
      <span
        aria-hidden="true"
        className={`${size} flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white`}
        style={{ background: "linear-gradient(135deg, var(--logo-cyan), var(--logo-blue))" }}
      >
        ДМ
      </span>
    );
  }
  const d = props.chat.startsAt ? new Date(props.chat.startsAt) : null;
  return (
    <span aria-hidden="true" className={`${size} flex shrink-0 flex-col items-center justify-center rounded-2xl bg-soft`}>
      {d ? (
        <>
          <span className="font-display text-lg leading-none font-semibold">{d.getDate()}</span>
          <span className="text-xs leading-tight">{d.toLocaleDateString("ru", { month: "short" }).replace(".", "")}</span>
        </>
      ) : (
        <span className="text-xl">📅</span>
      )}
    </span>
  );
}

function ChatPane(props: {
  chat: Chat;
  volunteerId: number;
  theirReadId: number;
  error: string;
  onSent: (m: Message) => void;
}) {
  const { chat } = props;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // новое сообщение — прокручиваем вниз
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length]);

  // поле растёт по мере набора, до ~5 строк
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
  }, [text]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setSendError("");
    try {
      props.onSent(
        await backend.sendMessage(props.volunteerId, { sender: "volunteer", text, opportunity_id: chat.opportunityId }),
      );
      setText("");
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

  // «прочитано» — под последним своим сообщением, если координатор до него дочитал
  const lastMine = [...chat.messages].reverse().find((m) => m.sender === "volunteer");

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => navigate("/messages")}
          aria-label="Все чаты"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-surface md:hidden"
        >
          ←
        </button>
        <ChatAvatar chat={chat} small />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-lg leading-snug font-semibold">{chat.title}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-hint">
            {chat.opportunityId ? (
              <>
                {chat.startsAt && <span>{formatWhen(chat.startsAt)}</span>}
                {chat.status && (
                  <span className={`rounded-full px-2.5 py-0.5 font-semibold ${PARTICIPATION_COLOR[chat.status]}`}>
                    {STATUS[chat.status]}
                  </span>
                )}
              </>
            ) : (
              <span>Фонд «Дети Марии»</span>
            )}
          </p>
        </div>
        {chat.opportunityId && (
          <Link to="/opportunities" className="shrink-0 text-link underline-offset-4 hover:underline max-sm:hidden">
            О занятии →
          </Link>
        )}
      </header>

      <div ref={listRef} className="chat-wall flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-6" aria-live="polite">
        {chat.messages.length === 0 ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 rounded-3xl bg-page p-4 text-center shadow-sm sm:gap-4 sm:p-6">
            <span aria-hidden="true" className="text-3xl sm:text-4xl">
              {chat.opportunityId ? "🙋" : "👋"}
            </span>
            <p className="sm:text-lg">
              {chat.opportunityId
                ? `Спросите координатора о занятии «${chat.title}» — вам ответят здесь.`
                : "Здесь можно задать координатору фонда любой вопрос — вам ответят здесь."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGEST[chat.opportunityId ? "opportunity" : "fund"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setText(s);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border-2 border-line px-3.5 py-1.5 font-medium transition hover:border-accent hover:bg-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chat.messages.map((m, i) => {
            const prev = chat.messages[i - 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            return (
              <div key={m.id} className="contents">
                {newDay && (
                  <p className="self-center rounded-full bg-page/90 px-3 py-0.5 text-sm font-medium text-hint shadow-sm">
                    {dayLabel(m.created_at)}
                  </p>
                )}
                <Bubble
                  m={m}
                  mine={m.sender === "volunteer"}
                  name="Координатор фонда"
                  // имя собеседника — только над первым сообщением подряд
                  showName={m.sender !== "volunteer" && (newDay || prev?.sender !== m.sender)}
                  read={m.id === lastMine?.id && props.theirReadId >= m.id}
                  inChat
                />
              </div>
            );
          })
        )}
      </div>

      {props.error && <p className="border-t border-line px-5 py-2 text-sm text-hint">⚠️ {props.error} Пробуем ещё раз…</p>}
      {sendError && (
        <div className="px-3 pt-3 sm:px-5">
          <ErrorBox text={sendError} />
        </div>
      )}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3 sm:px-5">
        <label className="sr-only" htmlFor="message-text">
          Сообщение
        </label>
        <textarea
          id="message-text"
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={MAX_LENGTH}
          placeholder="Сообщение…"
          title="Enter — отправить, Shift+Enter — новая строка"
          className="min-h-13 flex-1 resize-none rounded-3xl border-2 border-transparent bg-surface px-5 py-3 text-lg leading-snug outline-none placeholder:text-hint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Отправить"
          title="Отправить"
          className={`flex size-13 shrink-0 items-center justify-center rounded-full bg-accent text-accent-text shadow-sm transition hover:brightness-110 active:scale-95 disabled:opacity-40 ${sending ? "animate-pulse" : ""}`}
        >
          <svg viewBox="0 0 24 24" className="size-6 translate-x-px" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
          </svg>
        </button>
      </form>
    </>
  );
}

function Placeholder() {
  return (
    <div className="chat-wall flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <svg viewBox="0 0 120 90" className="w-36" aria-hidden="true">
        <rect x="6" y="8" width="70" height="34" rx="17" fill="var(--logo-cyan)" opacity="0.85" />
        <rect x="44" y="50" width="70" height="30" rx="15" fill="var(--p-accent)" />
        <circle cx="26" cy="25" r="4" fill="#fff" />
        <circle cx="41" cy="25" r="4" fill="#fff" />
        <circle cx="56" cy="25" r="4" fill="#fff" />
        <circle cx="98" cy="18" r="9" fill="var(--logo-yellow)" />
      </svg>
      <h2 className="font-display text-xl font-semibold">Выберите чат слева</h2>
      <p className="max-w-[34ch] text-hint">
        «Координатор фонда» — для любых вопросов. Остальные чаты — по вашим откликам на занятия.
      </p>
    </div>
  );
}

/** Время в списке чатов: «18:05» сегодня, «вчера», дальше — «21 окт.». */
function shortWhen(iso: string): string {
  const d = new Date(iso);
  const days = daysAgo(d);
  if (days === 0) return timeOf(iso);
  if (days === 1) return "вчера";
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

/** Над сообщениями одного дня: «Сегодня», «Вчера», «21 октября». */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = daysAgo(d);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

function daysAgo(d: Date): number {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(new Date()) - start(d)) / 86_400_000);
}

const MAX_INPUT_HEIGHT = 160; // px ≈ 5 строк
