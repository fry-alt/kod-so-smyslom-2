// Общие кусочки «Сводки» и «Аналитики»: блок-карточка, плитка с цифрой, «показать всё», склонения.
import { useState, type ReactNode } from "react";

import { navigate } from "../../router";
import { FLAIR, flairHandlers, Link } from "../../ui";

/** Блок экрана: заголовок, подпись, содержимое. Цветная точка — цвет логотипа фонда. */
export function Panel(props: {
  title: string;
  hint?: ReactNode;
  dot?: string;
  count?: number;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-[1.75rem] bg-surface p-5 md:p-6 ${props.className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-xl font-semibold leading-tight">
            {props.dot && <span className={`size-3 shrink-0 rounded-full ${props.dot}`} aria-hidden="true" />}
            {props.title}
            {props.count !== undefined && props.count > 0 && (
              <span className="shrink-0 rounded-full bg-page px-2.5 py-0.5 font-sans text-base font-semibold">{props.count}</span>
            )}
          </h2>
          {props.hint && <p className="text-hint">{props.hint}</p>}
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

/** Пустой блок — короткая спокойная фраза. */
export function AllClear(props: { children?: ReactNode }) {
  return (
    <p className="flex items-center gap-3 rounded-2xl bg-page px-4 py-3 text-hint">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-soft text-accent" aria-hidden="true">
        ✓
      </span>
      {props.children ?? "Всё разобрано"}
    </p>
  );
}

/** Список, который показывает первые limit пунктов и кнопку «Показать все». */
export function ShortList<T>(props: { items: T[]; limit?: number; render: (item: T) => ReactNode }) {
  const limit = props.limit ?? 5;
  const [all, setAll] = useState(false);
  const shown = all ? props.items : props.items.slice(0, limit);
  return (
    <>
      <ul className="flex flex-col gap-2">{shown.map(props.render)}</ul>
      {props.items.length > limit && (
        <button type="button" onClick={() => setAll(!all)} className="self-start font-semibold text-link hover:underline">
          {all ? "Свернуть" : `Показать все (${props.items.length})`}
        </button>
      )}
    </>
  );
}

/** Строка списка: слева главное (обычно имя-ссылка), справа — подробности и кнопки. */
export function Row(props: { children: ReactNode; side?: ReactNode; tone?: "warn" }) {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl px-4 py-3 ${
        props.tone === "warn" ? "bg-[color-mix(in_srgb,var(--p-cta)_10%,var(--p-page))]" : "bg-page"
      }`}
    >
      <div className="flex min-w-0 flex-col">{props.children}</div>
      {props.side && <div className="flex flex-wrap items-center gap-2">{props.side}</div>}
    </li>
  );
}

/** Имя волонтёра — ссылка на его карточку. */
export function PersonLink(props: { id: number; name: string }) {
  return (
    <Link to={`/admin/volunteers/${props.id}`} className="text-lg font-semibold break-words text-ink underline-offset-4 hover:text-link hover:underline">
      {props.name || `Волонтёр №${props.id}`}
    </Link>
  );
}

/** Склонение по числу: plural(3, "день", "дня", "дней") → «дня». */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** «3 дня», «1 день», «сегодня». */
export function daysText(days: number): string {
  if (days <= 0) return "сегодня";
  return `${days} ${plural(days, "день", "дня", "дней")}`;
}

/** Только время «15:00» из местного времени бэкенда. */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

/** Число по-русски: 1234.5 → «1 234,5». */
export function num(n: number): string {
  return n.toLocaleString("ru", { maximumFractionDigits: 1 });
}

/** Ссылка координатора на звонок. id собеседования и волонтёра — чтобы страница звонка могла показать план
 *  и форму итога (имя волонтёра в адрес не кладём). */
export function coordinatorCallUrl(token: string, interviewId: number, volunteerId: number): string {
  return `/call/${encodeURIComponent(token)}?as=coordinator&interview=${interviewId}&volunteer=${volunteerId}`;
}

/** Ссылка, которая выглядит как кнопка. newTab — открыть в новой вкладке (звонок: карточка остаётся открытой). */
export function LinkButton(props: { to: string; children: ReactNode; variant?: "primary" | "secondary"; newTab?: boolean }) {
  const look =
    props.variant === "secondary"
      ? `border-2 border-line bg-surface text-ink ${FLAIR.secondary}`
      : `bg-accent text-accent-text shadow-sm ${FLAIR.primary}`;
  return (
    <a
      href={props.to}
      target={props.newTab ? "_blank" : undefined}
      rel={props.newTab ? "noreferrer" : undefined}
      onClick={(e) => {
        if (props.newTab || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(props.to);
      }}
      {...flairHandlers}
      className={`btn-flair inline-flex min-h-12 items-center justify-center rounded-full px-5 py-2.5 font-semibold whitespace-nowrap ${look}`}
    >
      {props.children}
    </a>
  );
}
