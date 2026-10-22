// «Моя помощь» в личном кабинете: часы, занятия, график по месяцам и история откликов.
// Раньше это была отдельная страница /history — теперь всё видно сразу в кабинете.
import { useState } from "react";

import type { Opportunity, Participation, ParticipationStatus, Volunteer } from "../../api";
import { PARTICIPATION, PARTICIPATION_COLOR } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, formatHours, FundNumber, type NumberTone } from "../../ui";

/** «1 занятие», «3 занятия», «5 занятий». */
function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

/** Цвет полоски статуса — сплошной, чтобы различать на маленькой диаграмме. */
const STATUS_BAR: Record<ParticipationStatus, string> = {
  attended: "bg-accent",
  confirmed: "bg-logo-cyan",
  invited: "bg-pop",
  responded: "bg-logo-blue",
  declined: "bg-line",
};
const STATUS_ORDER: ParticipationStatus[] = ["attended", "confirmed", "invited", "responded", "declined"];

export default function MyHelp(props: { v: Volunteer; participations: Participation[]; opportunities: Opportunity[] }) {
  const { v, participations } = props;
  const when = new Map(props.opportunities.map((o) => [o.id, o.starts_at]));
  const dateOf = (p: Participation) => when.get(p.opportunity_id) ?? p.created_at;

  const attended = participations.filter((p) => p.status === "attended");
  const now = Date.now();
  const upcoming = participations
    .filter((p) => p.status === "confirmed" && new Date(dateOf(p)).getTime() > now)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const months = hoursByMonth(attended, dateOf);
  const thisMonth = months[months.length - 1].hours;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="my-help">
      <h2 id="my-help" className="font-display text-2xl font-semibold">
        Моя помощь
      </h2>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <HoursTile total={v.hours} thisMonth={thisMonth} months={months} />
        <div className="grid grid-cols-2 gap-3">
          <Tile
            tone="blue"
            value={String(attended.length)}
            label={plural(attended.length, "занятие", "занятия", "занятий") + " позади"}
          />
          <Tile
            tone="yellow"
            value={String(upcoming.length)}
            label={upcoming.length > 0 ? `впереди, ближайшее ${shortDate(dateOf(upcoming[0]))}` : "впереди — выберите занятие"}
          />
          <Tile
            tone="pink"
            value={String(participations.length)}
            label={plural(participations.length, "отклик", "отклика", "откликов") + " и приглашений"}
          />
          <ScoreTile score={v.training_score} />
        </div>
      </div>
      <Timeline participations={participations} dateOf={dateOf} />
    </section>
  );
}

// ===== Плитки =====

type Month = { key: string; label: string; hours: number };

/** Часы за последние 6 месяцев, включая текущий. Месяц занятия — по дате самого дела. */
function hoursByMonth(attended: Participation[], dateOf: (p: Participation) => string): Month[] {
  const today = new Date();
  const months: Month[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("ru", { month: "short" }).replace(".", ""),
      hours: 0,
    });
  }
  for (const p of attended) {
    const d = new Date(dateOf(p));
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.hours += p.hours;
  }
  return months;
}

function HoursTile(props: { total: number; thisMonth: number; months: Month[] }) {
  const max = Math.max(...props.months.map((m) => m.hours), 1);
  const empty = props.months.every((m) => m.hours === 0);
  return (
    <div className="relative flex flex-col gap-5 overflow-hidden rounded-[1.75rem] bg-accent p-5 text-white sm:p-6">
      <span aria-hidden="true" className="absolute -top-16 -right-12 size-48 rounded-full bg-white/10" />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-semibold text-white/85">Волонтёрских часов</span>
          {/* цифры — Onest: в Unbounded ноль похож на букву «О» */}
          <span className="text-5xl leading-tight font-bold sm:text-6xl">
            {formatHours(props.total)}
            <span className="ml-1 text-2xl text-white/85 sm:text-3xl">ч</span>
          </span>
        </div>
        {props.thisMonth > 0 && (
          <span className="rounded-full bg-pop px-3 py-1 font-semibold text-ink">+{formatHours(props.thisMonth)} ч в этом месяце</span>
        )}
      </div>
      <figure className="relative flex flex-col gap-2">
        <figcaption className="text-sm text-white/80">
          {empty ? "Здесь вырастет график — часы появятся после первого занятия" : "Часы по месяцам"}
        </figcaption>
        {/* столбик — до 96px, сверху место под подпись с часами */}
        <div className="flex h-32 items-end gap-2 sm:gap-3" role="img" aria-label={props.months.map((m) => `${m.label}: ${formatHours(m.hours)} ч`).join(", ")}>
          {props.months.map((m, i) => {
            const current = i === props.months.length - 1;
            return (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                {m.hours > 0 && <span className="text-sm font-semibold">{formatHours(m.hours)}</span>}
                <span
                  className={`bar-grow w-full rounded-t-xl rounded-b-md ${current ? "bg-pop" : "bg-white/70"}`}
                  style={{ height: m.hours > 0 ? Math.max((m.hours / max) * 96, 8) : 6, opacity: m.hours > 0 ? 1 : 0.35 }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 sm:gap-3" aria-hidden="true">
          {props.months.map((m) => (
            <span key={m.key} className="flex-1 text-center text-sm text-white/80">
              {m.label}
            </span>
          ))}
        </div>
      </figure>
    </div>
  );
}

/** Счётчик: цифра на пастельном круге, как на сайте фонда, под ней подпись. */
function Tile(props: { tone: NumberTone; value: string; label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-[1.5rem] bg-surface p-4 sm:p-5">
      <FundNumber tone={props.tone} className="self-start pt-1 text-4xl sm:text-5xl">
        {props.value}
      </FundNumber>
      <span className="leading-snug text-hint">{props.label}</span>
    </div>
  );
}

/** Балл за обучение — кольцом; до теста — приглашение пройти. */
function ScoreTile(props: { score: number | null }) {
  const score = props.score;
  const r = 26;
  const len = 2 * Math.PI * r;
  return (
    <button
      type="button"
      onClick={() => navigate("/training")}
      className="lift flex flex-col gap-1 rounded-[1.5rem] bg-surface p-4 text-left sm:p-5"
    >
      <svg viewBox="0 0 64 64" className="size-12 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="8" className="stroke-line" />
        {score !== null && (
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-accent"
            strokeDasharray={`${(score / 100) * len} ${len}`}
          />
        )}
      </svg>
      <span className="text-3xl font-bold sm:text-4xl">{score === null ? "—" : `${score}%`}</span>
      <span className="leading-snug text-hint">{score === null ? "обучение — пройти тест" : "балл за обучение"}</span>
    </button>
  );
}

/** «23 окт». */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru", { day: "numeric", month: "short" }).replace(".", "");
}

// ===== История =====

function Timeline(props: { participations: Participation[]; dateOf: (p: Participation) => string }) {
  const [all, setAll] = useState(false);
  const { participations, dateOf } = props;
  // сначала ближайшие и свежие
  const sorted = [...participations].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const shown = all ? sorted : sorted.slice(0, 4);
  const counts = STATUS_ORDER.map((s) => ({ s, n: participations.filter((p) => p.status === s).length })).filter((c) => c.n > 0);

  return (
    <div className="flex flex-col gap-4 rounded-[1.75rem] bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-semibold">Где вы помогали</h3>
        {sorted.length > 0 && (
          <button type="button" onClick={() => navigate("/opportunities")} className="font-semibold text-link hover:underline">
            Куда ещё пойти →
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-hint">Здесь появятся ваши отклики и занятия. Выберите, куда пойти, — и мы сохраним историю.</p>
          <Button onClick={() => navigate("/opportunities")}>Куда можно пойти</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex h-3 overflow-hidden rounded-full bg-page" aria-hidden="true">
              {counts.map((c) => (
                <span key={c.s} className={`bar-grow-x h-full ${STATUS_BAR[c.s]}`} style={{ width: `${(c.n / participations.length) * 100}%` }} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {counts.map((c) => (
                <li key={c.s} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-3 rounded-full ${STATUS_BAR[c.s]}`} />
                  {PARTICIPATION[c.s]}: <b>{c.n}</b>
                </li>
              ))}
            </ul>
          </div>

          <ul className="flex flex-col gap-2">
            {shown.map((p) => (
              <TimelineItem key={p.id} p={p} date={dateOf(p)} />
            ))}
          </ul>
          {sorted.length > 4 && (
            <button type="button" onClick={() => setAll(!all)} className="min-h-12 self-start rounded-full px-4 font-semibold text-link hover:underline">
              {all ? "Свернуть" : `Показать все (${sorted.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TimelineItem(props: { p: Participation; date: string }) {
  const { p } = props;
  const d = new Date(props.date);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-page p-3 sm:gap-4">
      <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-soft py-1.5">
        <span className="text-xl leading-none font-bold">{d.getDate()}</span>
        <span className="text-sm">{d.toLocaleDateString("ru", { month: "short" }).replace(".", "")}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="leading-snug font-semibold">{p.opportunity_title || "Дело фонда"}</span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge className={PARTICIPATION_COLOR[p.status]}>{PARTICIPATION[p.status]}</Badge>
          {p.status === "invited" && (
            <button type="button" onClick={() => navigate("/opportunities")} className="text-sm font-semibold text-link hover:underline">
              Ответить на приглашение
            </button>
          )}
        </span>
      </span>
      {p.status === "attended" && <span className="shrink-0 text-lg font-bold text-accent">+{formatHours(p.hours)} ч</span>}
    </li>
  );
}
