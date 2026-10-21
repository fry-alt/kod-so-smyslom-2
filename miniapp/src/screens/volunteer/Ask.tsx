// «Спросить о фонде»: чат с помощником, который отвечает по документам фонда (RAG) и показывает, откуда ответ.
// На компьютере — две колонки: слева заголовок и подсказки, справа переписка. На телефоне — одна колонка.
// Поле ввода и кнопка — одна «тягучая» капля (GooeyComposer, стили .goo в index.css).
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { ChatMessage, Source } from "../../api";
import { chatApi } from "../../backend";
import { tg } from "../../telegram";
import { ErrorBox, errorText } from "../../ui";

/** Примеры вопросов — нажать и сразу спросить. */
const EXAMPLES = ["Как стать волонтёром?", "Можно ли помогать онлайн?", "Что взять на первую встречу?"];

/** Понятные названия документов фонда вместо имён файлов. Новый файл без названия покажется как есть. */
const DOC_TITLES: Record<string, string> = {
  "about_fund.md": "О фонде",
  "faq.md": "Частые вопросы",
  "volunteer_rules.md": "Правила для волонтёров",
  "privacy_policy.md": "Политика конфиденциальности",
  "donations.txt": "Как ещё помочь фонду",
  "events.csv": "Ближайшие мероприятия",
  "volunteer_shifts.xlsx": "Расписание занятий",
  "workshop_guide.docx": "Памятка для мастерской",
  "01-about.md": "Обучение: о фонде",
  "02-wards.md": "Обучение: подопечные",
  "03-safety.md": "Обучение: безопасность",
  "04-mentoring.md": "Обучение: наставничество",
};

type Turn = ChatMessage & { sources?: Source[] };

export default function Ask() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-10">
      <header className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <h1 className="font-display text-[2rem] leading-[1.15] font-semibold tracking-tight text-balance md:text-[2.6rem]">
          Спросить о фонде
        </h1>
        <p className="text-lg text-hint">
          Помощник отвечает по документам фонда — правилам, памяткам и учебным материалам для волонтёров — и
          показывает, откуда взят ответ. Если в документах ответа нет, он честно об этом скажет.
        </p>
        <p className="hidden rounded-3xl bg-surface p-4 text-hint sm:block">
          🔒 Не пишите сюда телефон, адрес и паспортные данные — их лучше передать координатору лично.
        </p>
      </header>
      <section aria-label="Переписка с помощником" className="flex flex-col gap-5 rounded-[2rem] bg-surface p-4 md:p-6 lg:min-h-[26rem]">
        <ChatPanel />
      </section>
    </div>
  );
}

function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(""); // вопрос, на который ждём ответ, — показываем сразу
  const [error, setError] = useState("");
  const loading = pending !== "";
  const end = useRef<HTMLDivElement>(null);

  // новый вопрос или ответ — прокручиваем к нему, чтобы он не прятался под полем ввода
  useEffect(() => {
    if (turns.length || loading) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, loading]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;
    setMessage("");
    setPending(text);
    setError("");
    try {
      const history = turns.map(({ role, content }) => ({ role, content }));
      const { answer, sources } = await chatApi.chat(text, history);
      setTurns([...turns, { role: "user", content: text }, { role: "assistant", content: answer, sources }]);
      tg?.HapticFeedback?.impactOccurred("light");
    } catch (err) {
      setError(errorText(err));
      setMessage(text);
    } finally {
      setPending("");
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send(message);
  }

  return (
    <>
      <div aria-live="polite" className="flex flex-1 flex-col gap-2">
        {turns.length === 0 && !loading && (
          <>
            <p className="text-lg text-hint">Задайте вопрос о фонде или волонтёрстве — помощник ответит здесь.</p>
            <Examples onPick={send} />
          </>
        )}
        {turns.map((t, i) => (t.role === "user" ? <UserBubble key={i} text={t.content} /> : <AnswerBubble key={i} turn={t} />))}
        {loading && (
          <>
            <UserBubble text={pending} />
            <p role="status" className="self-start px-2 text-hint">
              Помощник ищет ответ в документах фонда…
            </p>
          </>
        )}
        <div ref={end} className="scroll-mb-32" />
      </div>
      {error && <ErrorBox text={error} />}
      <form onSubmit={submit} className="sticky bottom-0 -mx-1 flex flex-col gap-2 bg-surface px-1 py-2">
        <GooeyComposer
          value={message}
          onChange={setMessage}
          label="Ваш вопрос о фонде"
          placeholder="Напишите ваш вопрос"
          action="Спросить"
          loading={loading}
        />
        {turns.length > 0 && !loading && (
          <button type="button" onClick={() => setTurns([])} className="self-start px-2 text-hint underline-offset-4 hover:text-ink hover:underline">
            Начать разговор заново
          </button>
        )}
      </form>
    </>
  );
}

function UserBubble(props: { text: string }) {
  return (
    <div className="tile-in max-w-[85%] self-end whitespace-pre-wrap rounded-3xl rounded-br-lg bg-accent px-5 py-3 text-accent-text">
      {props.text}
    </div>
  );
}

/** Фрагмент документа без значков разметки (##, **, >) — читать как обычный текст. */
function plain(text: string) {
  return text.replace(/^\s*(#+|>)\s*/gm, "").replace(/\*\*|__/g, "");
}

/** Ответ помощника и под ним — откуда он: раскрывающиеся фрагменты документов фонда. */
function AnswerBubble(props: { turn: Turn }) {
  const sources = props.turn.sources ?? [];
  return (
    <div className="tile-in flex max-w-[85%] flex-col gap-2 self-start rounded-3xl rounded-bl-lg bg-page px-5 py-3">
      <p className="whitespace-pre-wrap">{props.turn.content}</p>
      {sources.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-2 text-sm">
          <span className="text-hint">Откуда ответ:</span>
          {sources.map((s) => (
            <details key={`${s.source}:${s.chunk}`}>
              <summary className="cursor-pointer text-link">📄 {DOC_TITLES[s.source] ?? s.source}</summary>
              <p className="mt-1 whitespace-pre-wrap text-hint">{plain(s.text)}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Examples(props: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-sm font-semibold text-hint">Например:</span>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => props.onPick(q)}
            className="min-h-12 rounded-full border border-line bg-page px-5 py-2 text-left transition-colors hover:border-accent hover:bg-soft"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Поле и кнопка — одна «тягучая» капля. Пока поле пустое и не в фокусе, кнопка сидит внутри поля;
 *  при фокусе или вводе поле «расходится»: большая часть уезжает влево, маленькая остаётся вокруг кнопки.
 *  При наборе в кнопку капают капли.
 *  Форму (и Enter) обрабатывает родитель. */
function GooeyComposer(props: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  action: string;
  loading: boolean;
}) {
  const filterId = `goo${useId().replace(/[^\w-]/g, "")}`;
  const [focused, setFocused] = useState(false);
  const [drip, setDrip] = useState(0);
  const lastDrip = useRef(0);

  const open = focused || props.value !== "";
  const ready = props.value.trim() !== "";

  function change(v: string) {
    // капля — не на каждую букву, а не чаще раза в полсекунды
    const now = Date.now();
    if (v.length > props.value.length && now - lastDrip.current > 500) {
      lastDrip.current = now;
      setDrip((d) => d + 1);
    }
    props.onChange(v);
  }

  return (
    <div className={`goo ${open ? "is-open" : ""} ${ready ? "is-ready" : ""} ${props.loading ? "is-busy" : ""} ${focused ? "is-focus" : ""}`}>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          {/* размыть и снова сделать резким: близкие фигуры слипаются, между ними тянется перемычка */}
          <filter id={filterId} x="-20%" y="-50%" width="140%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div className="goo-shapes" style={{ filter: `url(#${filterId})` }} aria-hidden="true">
        <span className="goo-sleeve" />
        <span className="goo-field" />
        {open && drip > 0 && <span key={drip} className="goo-drip" />}
        <span className="goo-btn" />
      </div>
      <div className="relative flex items-end">
        <GrowingTextarea
          value={props.value}
          onChange={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          label={props.label}
          placeholder={props.placeholder}
        />
        <button type="submit" disabled={props.loading} className="goo-send">
          <span className="sr-only sm:not-sr-only">{props.loading ? "Ждём…" : props.action}</span>
          {props.loading ? <Dots /> : <Arrow />}
        </button>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Dots() {
  return (
    <span className="goo-dots inline-flex sm:hidden" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Поле, которое растёт вниз по мере набора (до ~6 строк, дальше — прокрутка).
 *  Enter — отправить, Shift+Enter — новая строка. */
function GrowingTextarea(props: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  label: string;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function fit() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }

  useLayoutEffect(fit, [props.value]);

  // высоту пересчитываем и при смене ширины поля, и когда догрузился шрифт — иначе поле остаётся слишком высоким
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      aria-label={props.label}
      placeholder={props.placeholder}
      className="goo-input"
    />
  );
}

const MAX_TEXTAREA_HEIGHT = 200; // px ≈ 6 строк
