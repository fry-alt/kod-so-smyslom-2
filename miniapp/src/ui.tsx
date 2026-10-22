// Общие элементы интерфейса. Крупные: среди волонтёров пенсионеры, координатор не айтишник.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import type { VolunteerStatus } from "./api";
import { Icon } from "./icons";
import { STATUS, STATUS_COLOR, STATUS_STEP } from "./labels";
import { navigate } from "./router";

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  wide?: boolean;
  ariaPressed?: boolean;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}) {
  const variant = props.variant ?? "primary";
  const look = {
    primary: `btn-flair bg-accent text-accent-text shadow-sm ${FLAIR.primary}`,
    secondary: `btn-flair border-2 border-line bg-surface text-ink ${FLAIR.secondary}`,
    ghost: "text-link transition active:scale-[.98]",
  }[variant];
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      aria-pressed={props.ariaPressed}
      aria-expanded={props["aria-expanded"]}
      aria-controls={props["aria-controls"]}
      {...(variant === "ghost" ? {} : flairHandlers)}
      className={`min-h-12 rounded-full px-6 py-3 font-semibold disabled:opacity-50 ${look} ${props.wide ? "w-full" : ""}`}
    >
      {props.loading ? (props.loadingLabel ?? "Загрузка…") : props.children}
    </button>
  );
}

/** Цвет заливки при наведении (класс btn-flair в index.css): главная — жёлтым, второстепенная — зелёным. */
export const FLAIR = {
  /** главная кнопка страницы (оранжевая): заливка жёлтым из логотипа */
  cta: "[--flair:var(--logo-yellow)] [--flair-text:var(--p-ink)]",
  primary: "[--flair:var(--p-pop)] [--flair-text:var(--p-ink)]",
  secondary: "[--flair:var(--p-accent)] [--flair-text:var(--p-accent-text)] hover:border-accent",
};

function flairAt(e: PointerEvent<HTMLElement>, on: boolean) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--flair-x", `${e.clientX - r.left}px`);
  el.style.setProperty("--flair-y", `${e.clientY - r.top}px`);
  el.classList.toggle("is-flair", on);
}

/** Обработчики для кнопок с заливкой: круг растёт из точки входа курсора (или касания) и уходит в точку выхода. */
export const flairHandlers = {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => flairAt(e, true),
  onPointerLeave: (e: PointerEvent<HTMLElement>) => flairAt(e, false),
  // на телефоне pointerleave после касания приходит не всегда — убираем заливку при отпускании
  onPointerUp: (e: PointerEvent<HTMLElement>) => e.pointerType !== "mouse" && flairAt(e, false),
  onPointerCancel: (e: PointerEvent<HTMLElement>) => flairAt(e, false),
};

/** Ссылка внутри приложения: переход без перезагрузки страницы. */
export function Link(props: { to: string; children: ReactNode; className?: string; current?: boolean }) {
  return (
    <a
      href={props.to}
      aria-current={props.current ? "page" : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // открыть в новой вкладке — как обычно
        e.preventDefault();
        navigate(props.to);
      }}
      className={props.className ?? "text-link underline-offset-4 hover:underline"}
    >
      {props.children}
    </a>
  );
}

/** Навигационная ссылка, оформленная как кнопка для заметного действия-перехода. */
export function ButtonLink(props: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  wide?: boolean;
}) {
  const look = props.variant === "primary"
    ? `bg-accent text-accent-text shadow-sm ${FLAIR.primary}`
    : `border-2 border-line bg-surface text-ink ${FLAIR.secondary}`;
  return (
    <a
      href={props.to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // открыть в новой вкладке — как обычно
        e.preventDefault();
        navigate(props.to);
      }}
      {...flairHandlers}
      className={`btn-flair inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 font-semibold no-underline ${look} ${props.wide ? "w-full" : ""}`}
    >
      {props.children}
    </a>
  );
}

export function Card(props: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-3xl bg-surface p-5 ${props.className ?? ""}`}>{props.children}</div>;
}

export function Badge(props: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={props.title}
      className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${props.className ?? "bg-surface"}`}
    >
      {props.children}
    </span>
  );
}

/** Отметка статуса волонтёра: номер этапа (1–5) и название. Цвета — --status-* в index.css. */
export function StatusBadge(props: { status: VolunteerStatus; className?: string }) {
  const step = STATUS_STEP[props.status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[props.status]} ${props.className ?? ""}`}
    >
      {step && (
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-current/15 text-xs font-bold">
          {step}
        </span>
      )}
      {STATUS[props.status]}
    </span>
  );
}

export function Field(props: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** группа вариантов (Chips): div с ролью group и подписью вместо label, где label ломает клики */
  group?: boolean;
  children: ReactNode;
}) {
  const labelId = useId();
  const Tag = props.group ? "div" : "label";
  return (
    <Tag
      className="flex flex-col gap-1.5"
      data-error={props.error ? "" : undefined}
      {...(props.group ? { role: "group", "aria-labelledby": labelId } : {})}
    >
      <span id={labelId} className="font-semibold">
        {props.label}
        {props.required && <span className="text-accent"> *</span>}
      </span>
      {props.hint && <span className="text-sm text-hint">{props.hint}</span>}
      {props.children}
      {props.error && <span className="text-sm font-medium text-red-700">{props.error}</span>}
    </Tag>
  );
}

/** Выпадающий список в стиле приложения вместо системного <select>: карточка с вариантами,
 *  у варианта может быть пояснение. Клавиатура: стрелки, Home/End, Enter — выбрать, Esc — закрыть. */
export function Select(props: {
  label: string;
  placeholder: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = props.options.find((o) => o.value === props.value);

  // клик мимо списка — закрыть
  useEffect(() => {
    if (!open) return;
    const close = (e: globalThis.PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  // подсвеченный вариант всегда виден в прокручиваемом списке
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    setActive(Math.max(0, props.options.findIndex((o) => o.value === props.value)));
    setOpen(true);
  }
  function pick(index: number) {
    setOpen(false);
    props.onChange(props.options[index].value);
  }
  function onKey(e: KeyboardEvent) {
    const last = props.options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => (open ? setActive((i) => Math.min(last, i + 1)) : show()),
      ArrowUp: () => (open ? setActive((i) => Math.max(0, i - 1)) : show()),
      Home: () => open && setActive(0),
      End: () => open && setActive(last),
      Enter: () => (open ? pick(active) : show()),
      " ": () => (open ? pick(active) : show()),
      Escape: () => setOpen(false),
      Tab: () => setOpen(false),
    };
    if (!keys[e.key]) return;
    if (e.key !== "Tab") e.preventDefault();
    keys[e.key]();
  }

  return (
    <div ref={box} className="relative flex flex-col gap-1.5">
      <span id={`${id}-label`} className="font-semibold">
        {props.label}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`select-trigger ${inputClass} flex items-center justify-between gap-3 text-left`}
      >
        <span id={`${id}-value`} className={chosen ? "" : "text-hint"}>
          {chosen?.label ?? props.placeholder}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={`select-chevron ${open ? "is-open" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul ref={list} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="select-list">
          {props.options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === props.value}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => e.preventDefault()} // фокус остаётся на кнопке
              onClick={() => pick(i)}
              className={`select-option ${i === active ? "is-active" : ""}`}
            >
              <span className="font-semibold">{o.label}</span>
              {o.hint && <span className="select-hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Выбор из вариантов крупными «чипсами»: один (multiple=false) или несколько.
    Внутри — настоящие radio и checkbox: стрелки переключают вариант, Tab заходит в группу один раз.
    label — подпись группы для скринридера, если её не даёт Field group. */
export function Chips<T extends string>(props: {
  options: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const name = useId();
  const keys = Object.keys(props.options) as T[];
  function toggle(k: T) {
    if (!props.multiple) return props.onChange([k]);
    props.onChange(props.value.includes(k) ? props.value.filter((x) => x !== k) : [...props.value, k]);
  }
  return (
    <div
      className="flex flex-wrap gap-2"
      {...(props.label ? { role: props.multiple ? "group" : "radiogroup", "aria-label": props.label } : {})}
    >
      {keys.map((k) => {
        const on = props.value.includes(k);
        return (
          <label
            key={k}
            {...flairHandlers}
            // не выбран — при наведении заливается зелёным; выбран — белым
            className={`btn-flair inline-flex min-h-12 cursor-pointer items-center gap-[0.3em] rounded-full border px-5 py-2 select-none ${
              on
                ? "border-accent bg-accent text-accent-text [--flair:var(--p-page)] [--flair-text:var(--p-ink)]"
                : "border-line bg-page [--flair:var(--p-accent)] [--flair-text:var(--p-accent-text)] hover:border-accent"
            }`}
          >
            <input
              type={props.multiple ? "checkbox" : "radio"}
              name={name}
              value={k}
              checked={on}
              onChange={() => toggle(k)}
              className="sr-only"
            />
            {props.multiple && on && <span aria-hidden="true">✓</span>}
            {props.options[k]}
          </label>
        );
      })}
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-2xl border-2 border-[color-mix(in_srgb,var(--p-ink)_55%,transparent)] bg-page px-4 py-3 outline-none placeholder:text-hint focus:border-accent";

/** Ошибка с текстом. id — чтобы связать с полем через aria-describedby. */
export function ErrorBox(props: { text: string; onRetry?: () => void; id?: string }) {
  return (
    <div id={props.id} role="alert" className="flex flex-col gap-3 rounded-2xl bg-red-50 p-4 text-red-900">
      <p>
        <Icon name="alert" className="mr-1.5 size-[1.15em] align-[-0.2em]" />
        {props.text}
      </p>
      {props.onRetry && (
        <div>
          <Button variant="secondary" onClick={props.onRetry}>
            Попробовать ещё раз
          </Button>
        </div>
      )}
    </div>
  );
}

/** Заголовок страницы — одна шкала на всех экранах: Unbounded, как на «Сводке» и «Аналитике». */
export function PageTitle(props: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`font-display text-3xl font-semibold tracking-tight text-balance break-words md:text-4xl ${props.className ?? ""}`}>
      {props.children}
    </h1>
  );
}

export function Loading(props: { text?: string }) {
  return <p className="animate-pulse py-6 text-center text-hint">{props.text ?? "Загружаем…"}</p>;
}

export function Empty(props: { children: ReactNode }) {
  return <p className="py-6 text-center text-hint">{props.children}</p>;
}

/** Контакт: скопировать в один клик, для @ника — открыть чат в Telegram. */
export function Contact({ contact }: { contact: string }) {
  const [copied, setCopied] = useState(false);
  const username = contact.match(/^@([A-Za-z0-9_]{4,})$/)?.[1] ?? contact.match(/t\.me\/([A-Za-z0-9_]{4,})/)?.[1];

  async function copy() {
    try {
      await navigator.clipboard.writeText(contact);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер обмена недоступен — контакт виден на экране */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-page px-4 py-2">
      <span className="font-medium">{contact}</span>
      <button type="button" onClick={copy} className="text-link hover:underline">
        {copied ? "Контакт скопирован ✓" : "Скопировать контакт"}
      </button>
      {username && (
        <a href={`https://t.me/${username}`} target="_blank" rel="noreferrer" className="text-link hover:underline">
          Открыть Telegram
        </a>
      )}
    </div>
  );
}

/** Заглушка экрана, который делается в отдельной задаче. */
export function Todo(props: { task: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line p-4 text-hint">
      <span aria-hidden="true">🚧</span> Экран делается в задаче <b>{props.task}</b>. {props.children}
    </div>
  );
}

/** Загрузить данные при открытии экрана: { data, error, loading, reload }. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // deps — как у useEffect: при их изменении данные загружаются заново
  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    run()
      .then(setData)
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [run]);

  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "Нет связи с сервером. Проверьте интернет.";
  if (/internal server error|bad gateway|service unavailable|gateway time-?out/i.test(msg))
    return "Сервер сейчас не отвечает. Попробуйте ещё раз через минуту.";
  if (/^not found$/i.test(msg)) return "Не нашли. Возможно, запись удалили.";
  // свои ошибки сервер пишет по-русски — их показываем как есть; английский и технический текст — нет
  if (/[а-яё]/i.test(msg)) return msg;
  return "Не получилось. Попробуйте ещё раз или напишите координатору.";
}

/** Дата и время возможности по-русски: «23 октября, 10:00». */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/** Часы без лишних нулей: 3 → «3», 2.5 → «2,5». */
export function formatHours(hours: number): string {
  return hours.toLocaleString("ru", { maximumFractionDigits: 1 });
}
