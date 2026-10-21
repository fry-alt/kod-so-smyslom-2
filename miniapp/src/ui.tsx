// Общие элементы интерфейса. Крупные: среди волонтёров пенсионеры, координатор не айтишник.
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { navigate } from "./router";

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  wide?: boolean;
}) {
  const variant = props.variant ?? "primary";
  const look = {
    primary: "bg-accent text-accent-text shadow-sm",
    secondary: "bg-surface text-ink border border-line",
    ghost: "text-link",
  }[variant];
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      className={`min-h-12 rounded-2xl px-5 py-3 font-semibold transition active:scale-[.98] disabled:opacity-50 ${look} ${
        props.wide ? "w-full" : ""
      }`}
    >
      {props.loading ? "Загрузка…" : props.children}
    </button>
  );
}

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

export function Badge(props: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${props.className ?? "bg-surface"}`}>
      {props.children}
    </span>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{props.label}</span>
      {props.hint && <span className="text-sm text-hint">{props.hint}</span>}
      {props.children}
    </label>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-2xl border border-line bg-page px-4 py-3 outline-none placeholder:text-hint focus:border-accent";

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
  return msg || "Что-то пошло не так.";
}
