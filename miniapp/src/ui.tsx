// Общие элементы интерфейса. Крупные: среди волонтёров пенсионеры, координатор не айтишник.
import { useCallback, useEffect, useState, type PointerEvent, type ReactNode } from "react";

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
export function Link(props: { to: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={props.to}
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

export function Card(props: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-surface p-5 ${props.className ?? ""}`}>{props.children}</div>;
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

export function Field(props: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** div вместо label — для групп кнопок (Chips), где label ломает клики */
  group?: boolean;
  children: ReactNode;
}) {
  const Tag = props.group ? "div" : "label";
  return (
    <Tag className="flex flex-col gap-1.5" data-error={props.error ? "" : undefined}>
      <span className="font-semibold">
        {props.label}
        {props.required && <span className="text-accent"> *</span>}
      </span>
      {props.hint && <span className="text-sm text-hint">{props.hint}</span>}
      {props.children}
      {props.error && <span className="text-sm font-medium text-red-700">{props.error}</span>}
    </Tag>
  );
}

/** Выбор из вариантов крупными «чипсами»: один (multiple=false) или несколько. */
export function Chips<T extends string>(props: {
  options: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
  multiple?: boolean;
}) {
  const keys = Object.keys(props.options) as T[];
  function toggle(k: T) {
    if (!props.multiple) return props.onChange([k]);
    props.onChange(props.value.includes(k) ? props.value.filter((x) => x !== k) : [...props.value, k]);
  }
  return (
    <div className="flex flex-wrap gap-2" role={props.multiple ? "group" : "radiogroup"}>
      {keys.map((k) => {
        const on = props.value.includes(k);
        return (
          <button
            key={k}
            type="button"
            role={props.multiple ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => toggle(k)}
            {...flairHandlers}
            // не выбран — при наведении заливается зелёным; выбран — белым
            className={`btn-flair min-h-12 rounded-full border px-5 py-2 ${
              on
                ? "border-accent bg-accent text-accent-text [--flair:var(--p-page)] [--flair-text:var(--p-ink)]"
                : "border-line bg-page [--flair:var(--p-accent)] [--flair-text:var(--p-accent-text)] hover:border-accent"
            }`}
          >
            {props.multiple && (on ? "✓ " : "")}
            {props.options[k]}
          </button>
        );
      })}
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-2xl border-2 border-[color-mix(in_srgb,var(--p-ink)_55%,transparent)] bg-page px-4 py-3 outline-none placeholder:text-hint focus:border-accent";

export function ErrorBox(props: { text: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-red-50 p-4 text-red-900">
      <p>⚠️ {props.text}</p>
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
        {copied ? "Скопировано ✓" : "Копировать"}
      </button>
      {username && (
        <a href={`https://t.me/${username}`} target="_blank" rel="noreferrer" className="text-link hover:underline">
          Написать в Telegram
        </a>
      )}
    </div>
  );
}

/** Заглушка экрана, который делается в отдельной задаче. */
export function Todo(props: { task: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line p-4 text-hint">
      🚧 Экран делается в задаче <b>{props.task}</b>. {props.children}
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
  if (/^not found$/i.test(msg)) return "Эта функция на сервере ещё не готова.";
  return msg || "Что-то пошло не так.";
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
