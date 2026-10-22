// «Аналитика» (T-69): где теряем волонтёров, где не хватает людей, как идёт работа по неделям.
// Данные — GET /dashboard/analytics. Графики — обычные блоки с шириной/высотой в процентах, без библиотек.
import { useState } from "react";

import type { DashboardAnalytics, FunnelRow, Occupation, SupplyRow, WeekRow } from "../../api";
import { backend } from "../../backend";
import { AVAILABILITY, FORMAT, FUNNEL_STEP, OCCUPATION, REGION } from "../../labels";
import { Chips, ErrorBox, Loading, PageTitle, useLoad } from "../../ui";
import { AllClear, num, Panel, PersonLink, plural } from "./parts";

export default function Analytics() {
  const { data, error, loading, reload } = useLoad(() => backend.dashboardAnalytics());
  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Аналитика</PageTitle>
        <p className="mt-1 text-lg text-hint">Где теряем волонтёров, где не хватает людей и как идёт работа.</p>
      </div>
      {loading && !data && <Loading text="Считаем…" />}
      {error && <ErrorBox text={`Не удалось загрузить аналитику: ${error}`} onRetry={reload} />}
      {data && <Charts a={data} />}
    </div>
  );
}

function Charts({ a }: { a: DashboardAnalytics }) {
  return (
    <>
      <Funnel rows={a.funnel} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Supply title="Спрос и время" hint="Занятия на 30 дней вперёд и волонтёры, которым удобно это время." rows={a.by_time} />
        <Supply title="Спрос и регионы" hint="Очные занятия — по региону, онлайн — отдельно." rows={a.by_region} />
      </div>
      <Weeks rows={a.weeks} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Top a={a} />
        <Dormant a={a} />
      </div>
    </>
  );
}

// ===== Воронка =====

type FunnelMode = "all" | "occupation";
const FUNNEL_MODE: Record<FunnelMode, string> = { all: "Все", occupation: "По занятости" };

function Funnel({ rows }: { rows: FunnelRow[] }) {
  const [mode, setMode] = useState<FunnelMode>("all");
  const occupations = (Object.keys(OCCUPATION) as Occupation[]).filter((o) => (rows[0]?.by_occupation[o] ?? 0) > 0);

  return (
    <Panel
      title="Путь волонтёра: где люди уходят"
      hint="Сколько человек дошли до каждого шага — от анкеты до регулярного участия."
      dot="bg-logo-blue"
      action={<Chips options={FUNNEL_MODE} value={[mode]} onChange={(v) => setMode(v[0])} />}
    >
      {rows.length === 0 || rows[0].count === 0 ? (
        <AllClear>Анкет пока нет</AllClear>
      ) : mode === "all" ? (
        <FunnelBars counts={rows.map((r) => ({ row: r, count: r.count }))} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {occupations.map((o) => (
            <div key={o} className="flex flex-col gap-3 rounded-2xl bg-page p-4">
              <h3 className="text-lg font-semibold">{OCCUPATION[o]}</h3>
              <FunnelBars compact counts={rows.map((r) => ({ row: r, count: r.by_occupation[o] ?? 0 }))} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Горизонтальные полосы шагов. Шаг, после которого уходит больше всего людей, подписан словами. */
function FunnelBars(props: { counts: { row: FunnelRow; count: number }[]; compact?: boolean }) {
  const first = props.counts[0]?.count ?? 0;
  // где больше всего потеряли (в людях) — между шагом i-1 и i
  let worst = -1;
  let worstLoss = 0;
  props.counts.forEach((c, i) => {
    const loss = i > 0 ? props.counts[i - 1].count - c.count : 0;
    if (loss > worstLoss) {
      worstLoss = loss;
      worst = i;
    }
  });

  return (
    <div className="flex flex-col gap-3">
      <ol className={`flex flex-col ${props.compact ? "gap-1.5" : "gap-2.5"}`}>
        {props.counts.map(({ row, count }, i) => {
          const prev = i > 0 ? props.counts[i - 1].count : count;
          const share = first > 0 ? count / first : 0;
          const lost = prev - count;
          const allGone = i > 0 && prev > 0 && count === 0;
          return (
            <li
              key={row.step}
              className={`grid items-center gap-x-3 ${
                props.compact ? "grid-cols-[7.5rem_1fr_2.5rem] text-sm" : "grid-cols-[minmax(7rem,11rem)_1fr_auto]"
              }`}
            >
              <span className={props.compact ? "leading-tight" : "font-medium leading-tight"}>{FUNNEL_STEP[row.step]}</span>
              <span className="relative h-7 rounded-md bg-surface" title={`${FUNNEL_STEP[row.step]}: ${count}`}>
                <span
                  className={`absolute inset-y-0 left-0 rounded-md ${i === worst ? "bg-cta" : "bg-accent"}`}
                  style={{ width: `${Math.max(share * 100, count > 0 ? 2 : 0)}%` }}
                />
              </span>
              <span className={`text-right font-semibold ${props.compact ? "" : "min-w-[6.5rem] text-lg"}`}>
                {i === worst && <span aria-hidden="true">▼ </span>}
                {count}
                {!props.compact && i > 0 && lost > 0 && (
                  <span className="ml-2 text-base font-normal text-hint">−{lost}</span>
                )}
              </span>
              {allGone && props.compact && (
                <span className="col-span-3 col-start-1 text-sm font-medium">✕ дальше этого шага никто не дошёл</span>
              )}
            </li>
          );
        })}
      </ol>
      {worst > 0 && (
        <p className={`flex gap-2 ${props.compact ? "text-sm" : ""}`}>
          <span className="mt-1.5 size-3 shrink-0 rounded-sm bg-cta" aria-hidden="true" />
          <span aria-hidden="true">▼</span>
          <span>
            Больше всего уходят перед шагом «{FUNNEL_STEP[props.counts[worst].row.step]}»: −{worstLoss}{" "}
            {plural(worstLoss, "человек", "человека", "человек")}
            {props.counts[worst - 1].count > 0 &&
              ` (${Math.round((worstLoss / props.counts[worst - 1].count) * 100)}%)`}
            .
          </span>
        </p>
      )}
    </div>
  );
}

// ===== Спрос и предложение =====

function keyLabel(key: SupplyRow["key"]): string {
  if (key === "online") return FORMAT.online;
  return (AVAILABILITY as Record<string, string>)[key] ?? (REGION as Record<string, string>)[key] ?? key;
}

function Supply(props: { title: string; hint: string; rows: SupplyRow[] }) {
  const max = Math.max(1, ...props.rows.flatMap((r) => [r.demand, r.supply]));
  const short = props.rows.filter((r) => r.demand > r.supply);
  return (
    <Panel title={props.title} hint={props.hint} dot="bg-cta">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-3.5 rounded-sm bg-cta" aria-hidden="true" /> Нужно мест
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3.5 rounded-sm bg-logo-cyan" aria-hidden="true" /> Свободно волонтёров
        </span>
      </div>
      {props.rows.length === 0 ? (
        <AllClear>Ближайших занятий нет</AllClear>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.rows.map((r) => {
            const gap = r.demand - r.supply;
            return (
              <li
                key={r.key}
                className={`flex flex-col gap-1.5 rounded-2xl px-3 py-2.5 ${
                  gap > 0 ? "bg-[color-mix(in_srgb,var(--p-cta)_10%,var(--p-page))]" : "bg-page"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <span className="font-semibold">{keyLabel(r.key)}</span>
                  {gap > 0 && <span className="text-sm font-semibold">⚠ не хватает {gap}</span>}
                </div>
                <Bar value={r.demand} max={max} color="bg-cta" label={`нужно ${r.demand}`} />
                <Bar value={r.supply} max={max} color="bg-logo-cyan" label={`свободно ${r.supply}`} />
              </li>
            );
          })}
        </ul>
      )}
      {short.length > 0 && (
        <p>
          Не хватает людей: {short.map((r) => `«${keyLabel(r.key)}»`).join(", ")}. Здесь стоит искать новых
          волонтёров или переносить занятия.
        </p>
      )}
    </Panel>
  );
}

function Bar(props: { value: number; max: number; color: string; label: string }) {
  return (
    <span className="flex items-center gap-2" title={props.label}>
      <span className="relative h-3.5 flex-1">
        <span
          className={`absolute inset-y-0 left-0 rounded-r-md ${props.color}`}
          style={{ width: `${(props.value / props.max) * 100}%`, minWidth: props.value > 0 ? "4px" : 0 }}
        />
      </span>
      <span className="w-24 shrink-0 text-sm">{props.label}</span>
    </span>
  );
}

// ===== Часы по неделям =====

function Weeks({ rows }: { rows: WeekRow[] }) {
  const max = Math.max(1, ...rows.map((w) => w.hours));
  const hours = rows.reduce((s, w) => s + w.hours, 0);
  const visits = rows.reduce((s, w) => s + w.participations, 0);
  const best = rows.findIndex((w) => w.hours === max);
  const [active, setActive] = useState<number | null>(null);

  return (
    <Panel
      title="Часы волонтёров по неделям"
      hint={`За 12 недель: ${num(hours)} ${plural(Math.round(hours), "час", "часа", "часов")}, ${visits} ${plural(visits, "участие", "участия", "участий")} в занятиях.`}
      dot="bg-accent"
    >
      <div className="flex h-56 items-end gap-1.5 border-b-2 border-line pt-8 sm:gap-3" onMouseLeave={() => setActive(null)}>
        {rows.map((w, i) => {
          // без наведения подписаны лучшая и последняя неделя (если они не рядом — иначе подписи налезут)
          const last = rows.length - 1;
          const showLabel = i === active || (active === null && (i === best || (i === last && last - best > 1)));
          return (
            <div
              key={w.week_start}
              tabIndex={0}
              role="img"
              aria-label={`Неделя с ${weekLabel(w.week_start)}: ${num(w.hours)} ч, участий ${w.participations}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full min-w-0 flex-1 basis-0 cursor-default flex-col justify-end rounded-t-md outline-offset-2"
            >
              {showLabel && (
                <span className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-center text-xs leading-tight whitespace-nowrap text-page shadow">
                  <b className="text-sm">{num(w.hours)} ч</b>
                  {i === active && (
                    <>
                      <br />
                      {w.participations} {plural(w.participations, "участие", "участия", "участий")}
                    </>
                  )}
                </span>
              )}
              <span
                className={`block rounded-t-md transition-colors ${i === active ? "bg-ink" : "bg-accent"}`}
                style={{ height: `${(w.hours / max) * 100}%`, minHeight: w.hours > 0 ? 4 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 text-xs text-hint sm:gap-3" aria-hidden="true">
        {rows.map((w, i) => (
          <span key={w.week_start} className={`min-w-0 flex-1 basis-0 text-center whitespace-nowrap ${i % 2 === 1 ? "max-sm:invisible" : ""}`}>
            {weekLabel(w.week_start)}
          </span>
        ))}
      </div>
      <details className="rounded-2xl bg-page px-4 py-3">
        <summary className="cursor-pointer font-semibold text-link">Показать цифрами</summary>
        <table className="mt-3 w-full text-left tabular-nums">
          <thead className="text-hint">
            <tr>
              <th className="py-1 font-medium">Неделя с</th>
              <th className="py-1 font-medium">Часы</th>
              <th className="py-1 font-medium">Участий</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.week_start} className="border-t border-line">
                <td className="py-1">{weekLabel(w.week_start)}</td>
                <td className="py-1">{num(w.hours)}</td>
                <td className="py-1">{w.participations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}

/** Понедельник недели «2026-10-19» → «19.10». */
function weekLabel(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return d && m ? `${d}.${m}` : isoDate;
}

// ===== Топ и «засыпающие» =====

function Top({ a }: { a: DashboardAnalytics }) {
  const max = Math.max(1, ...a.top.map((t) => t.hours));
  return (
    <Panel title="Больше всего часов" hint="Пять человек за последние 12 недель — им стоит сказать спасибо." dot="bg-pop">
      {a.top.length === 0 ? (
        <AllClear>Пока никто не участвовал</AllClear>
      ) : (
        <ol className="flex flex-col gap-2">
          {a.top.map((t, i) => (
            <li key={t.volunteer.id} className="flex items-center gap-3 rounded-2xl bg-page px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-soft font-display font-semibold">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <PersonLink {...t.volunteer} />
                <span className="h-2 rounded-full bg-surface">
                  <span className="block h-2 rounded-full bg-pop" style={{ width: `${(t.hours / max) * 100}%` }} />
                </span>
              </div>
              <span className="shrink-0 text-right leading-tight">
                <b className="text-lg">{num(t.hours)} ч</b>
                <br />
                <span className="text-sm text-hint">
                  {t.participations} {plural(t.participations, "участие", "участия", "участий")}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Dormant({ a }: { a: DashboardAnalytics }) {
  return (
    <Panel
      title="Давно не участвовали"
      hint="Допущены, но не приходили 45 дней и дольше. Позовите на ближайшее занятие."
      dot="bg-logo-berry"
      count={a.dormant.length}
    >
      {a.dormant.length === 0 ? (
        <AllClear>Все допущенные участвуют</AllClear>
      ) : (
        <ul className="flex flex-col gap-2">
          {a.dormant.map((d) => (
            <li key={d.volunteer.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-page px-4 py-3">
              <PersonLink {...d.volunteer} />
              <span className="text-hint">
                {d.days === null || d.last_attended === null
                  ? "допущен, но ещё ни разу не участвовал"
                  : `не участвовал ${d.days} ${plural(d.days, "день", "дня", "дней")} · последний раз ${new Date(
                      d.last_attended,
                    ).toLocaleDateString("ru", { day: "numeric", month: "long" })}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
