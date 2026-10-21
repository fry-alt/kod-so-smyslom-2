// «Спросить о фонде»: вопросы по документам фонда (RAG) и чат — перенесено из демо шаблона.
// На компьютере — две колонки: слева заголовок и вкладки, справа поле и ответы. На телефоне — одна колонка.
// Поле ввода и кнопка — одна «тягучая» капля (GooeyComposer, стили .goo в index.css).
import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { AskResponse, ChatMessage } from "../../api";
import { chatApi } from "../../backend";
import { tg } from "../../telegram";
import { ErrorBox, errorText } from "../../ui";

type Tab = "docs" | "chat";

const TABS: { id: Tab; icon: string; title: string; hint: string }[] = [
  { id: "docs", icon: "📚", title: "По документам", hint: "Точный ответ со ссылкой на документ фонда" },
  { id: "chat", icon: "💬", title: "Чат", hint: "Поговорить и уточнить шаг за шагом" },
];

/** Примеры вопросов — нажать и сразу спросить. */
const EXAMPLES = ["Как стать волонтёром?", "Можно ли помогать онлайн?", "Что взять на первую встречу?"];

export default function Ask() {
  const [tab, setTab] = useState<Tab>("docs");
  const id = useId();

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    // стрелки переключают вкладки — как в обычных вкладках
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = tab === "docs" ? "chat" : "docs";
    setTab(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-10">
      <header className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <h1 className="font-display text-[2rem] leading-[1.15] font-semibold tracking-tight text-balance md:text-[2.6rem]">
          Спросить о фонде
        </h1>
        <p className="text-lg text-hint">
          Отвечаем по документам фонда — уставу, правилам и памяткам для волонтёров. Если в них ответа нет, честно
          скажем об этом.
        </p>
        <div role="tablist" aria-label="Как спросить" className="grid grid-cols-2 gap-1 rounded-3xl bg-surface p-1 sm:p-1.5 lg:grid-cols-1 lg:gap-2">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                id={`${id}-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${id}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={onTabKey}
                className={`ask-tab flex min-h-12 items-center justify-center gap-3 rounded-[1.1rem] px-2 py-2 text-left sm:px-3 lg:justify-start lg:px-4 lg:py-3 ${
                  on ? "bg-page font-semibold shadow-sm" : "text-hint hover:bg-soft hover:text-ink"
                }`}
              >
                <span aria-hidden="true" className="hidden text-xl sm:inline lg:flex lg:size-11 lg:shrink-0 lg:items-center lg:justify-center lg:rounded-full lg:bg-soft">
                  {t.icon}
                </span>
                <span className="flex flex-col">
                  <span className="whitespace-nowrap text-[0.9rem] sm:text-base">{t.title}</span>
                  <span className="hidden text-sm font-normal text-hint lg:block">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </header>
      <section
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
        className="flex flex-col gap-5 rounded-[2rem] bg-surface p-4 md:p-6 lg:min-h-[26rem]"
      >
        {tab === "docs" ? <AskPanel /> : <ChatPanel />}
      </section>
    </div>
  );
}

function AskPanel() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ask(text: string) {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      setResult(await chatApi.ask(text));
      tg?.HapticFeedback?.impactOccurred("light");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(question);
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <form onSubmit={submit}>
          <GooeyComposer
            value={question}
            onChange={setQuestion}
            label="Ваш вопрос о фонде"
            placeholder="Напишите ваш вопрос"
            action="Спросить"
            loading={loading}
          />
        </form>
        <p role="status" className="px-2 text-hint">
          {loading ? "Ищем ответ в документах фонда…" : ""}
        </p>
      </div>
      {error && <ErrorBox text={error} />}
      {result ? (
        <article key={result.answer} className="tile-in flex flex-col gap-3 rounded-3xl bg-page p-5 md:p-6">
          <span className={`self-start rounded-full px-3 py-1 text-sm font-semibold ${result.found ? "bg-soft text-accent" : "bg-surface text-hint"}`}>
            {result.found ? "✓ Нашли в документах" : "В документах ответа нет"}
          </span>
          <p className={`text-lg ${result.found ? "" : "text-hint"}`}>{result.answer}</p>
          {result.sources.map((s) => (
            <details key={`${s.source}:${s.chunk}`} className="text-sm">
              <summary className="cursor-pointer text-link">
                📄 {s.source} · фрагмент {s.chunk}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-hint">{s.text}</p>
            </details>
          ))}
        </article>
      ) : (
        <Examples
          onPick={(q) => {
            setQuestion(q);
            ask(q);
          }}
        />
      )}
    </>
  );
}

function ChatPanel() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;
    setMessage("");
    setLoading(true);
    setError("");
    try {
      const { answer } = await chatApi.chat(text, history);
      setHistory([...history, { role: "user", content: text }, { role: "assistant", content: answer }]);
    } catch (err) {
      setError(errorText(err));
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send(message);
  }

  return (
    <>
      <div aria-live="polite" className="flex flex-1 flex-col gap-2">
        {history.length === 0 && (
          <>
            <p className="text-lg text-hint">Напишите первое сообщение — помощник ответит здесь.</p>
            <Examples onPick={send} />
          </>
        )}
        {history.map((m, i) => (
          <div
            key={i}
            className={`tile-in max-w-[85%] whitespace-pre-wrap rounded-3xl px-5 py-3 ${
              m.role === "user" ? "self-end rounded-br-lg bg-accent text-accent-text" : "self-start rounded-bl-lg bg-page"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && <p className="self-start px-2 text-hint">Помощник пишет…</p>}
      </div>
      {error && <ErrorBox text={error} />}
      <form onSubmit={submit} className="sticky bottom-0 -mx-1 bg-surface px-1 py-2">
        <GooeyComposer
          value={message}
          onChange={setMessage}
          label="Сообщение"
          placeholder="Сообщение"
          action="Отправить"
          loading={loading}
        />
      </form>
    </>
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
