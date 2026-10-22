// «Сводка» (T-69) — главный экран кабинета фонда: что сделать сегодня.
// Цифры сверху, ниже — списки людей и занятий, которым нужно внимание координатора.
// Каждый пункт ведёт в карточку волонтёра или возможности. Данные — GET /dashboard/today.
import type { ReactNode } from "react";

import type { DashboardToday } from "../../api";
import { backend } from "../../backend";
import { Badge, ErrorBox, formatWhen, Link, Loading, PageTitle, useLoad } from "../../ui";
import {
  AllClear,
  coordinatorCallUrl,
  daysText,
  LinkButton,
  num,
  Panel,
  PersonLink,
  plural,
  Row,
  ShortList,
  timeOf,
} from "./parts";

export default function Summary() {
  const { data, error, loading, reload } = useLoad(() => backend.dashboardToday());
  const today = new Date().toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-lg text-hint first-letter:uppercase">{today}</p>
          <PageTitle>Сводка на сегодня</PageTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/admin/search" variant="secondary">
            Умный поиск
          </LinkButton>
          <LinkButton to="/admin/analytics" variant="secondary">
            Аналитика
          </LinkButton>
        </div>
      </div>

      {loading && !data && <Loading text="Собираем сводку…" />}
      {error && <ErrorBox text={`Не удалось загрузить сводку: ${error}`} onRetry={reload} />}
      {data && <Dashboard d={data} />}
    </div>
  );
}

function Dashboard({ d }: { d: DashboardToday }) {
  const c = d.counters;
  return (
    <>
      <Interviews d={d} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Ждут знакомства"
          hint="Новые анкеты без собеседования. Дольше ждут — выше."
          dot="bg-logo-cyan"
          count={d.new_without_interview.length}
        >
          {d.new_without_interview.length === 0 ? (
            <AllClear>Всех новичков уже позвали на собеседование</AllClear>
          ) : (
            <ShortList
              items={d.new_without_interview}
              render={(w) => (
                <Row
                  key={w.volunteer.id}
                  tone={w.days >= 3 ? "warn" : undefined}
                  side={<LinkButton to={`/admin/volunteers/${w.volunteer.id}#interview`} variant="secondary">Назначить</LinkButton>}
                >
                  <PersonLink {...w.volunteer} />
                  <span className="text-hint">
                    {w.days > 0 ? `ждёт ${daysText(w.days)}` : "анкета пришла сегодня"}
                  </span>
                </Row>
              )}
            />
          )}
        </Panel>

        <Panel
          title="Ждут допуска"
          hint="Прошли обучение. Посмотрите балл и допустите к занятиям."
          dot="bg-accent"
          count={d.awaiting_approval.length}
        >
          {d.awaiting_approval.length === 0 ? (
            <AllClear />
          ) : (
            <ShortList
              items={d.awaiting_approval}
              render={(w) => (
                <Row
                  key={w.volunteer.id}
                  side={
                    <>
                      {w.training_score !== null && (
                        <Badge className="bg-soft text-ink">
                          Балл <b>{w.training_score}%</b>
                        </Badge>
                      )}
                      <LinkButton to={`/admin/volunteers/${w.volunteer.id}`} variant="secondary">
                        Допустить
                      </LinkButton>
                    </>
                  }
                >
                  <PersonLink {...w.volunteer} />
                  <span className="text-hint">{w.days > 0 ? `ждёт ${daysText(w.days)}` : "обучение пройдено сегодня"}</span>
                </Row>
              )}
            />
          )}
        </Panel>

        <Panel
          title="Отклики без ответа"
          hint="Человек откликнулся на занятие — подтвердите или откажите."
          dot="bg-logo-berry"
          count={d.pending_responses.length}
        >
          {d.pending_responses.length === 0 ? (
            <AllClear />
          ) : (
            <ShortList
              items={d.pending_responses}
              render={(p) => (
                <Row
                  key={p.participation_id}
                  side={
                    <>
                      <LinkButton to={`/admin/messages/${p.volunteer.id}?about=${p.opportunity_id}`} variant="secondary">
                        Написать
                      </LinkButton>
                      <LinkButton to={`/admin/opportunities/${p.opportunity_id}`} variant="secondary">
                        Ответить
                      </LinkButton>
                    </>
                  }
                >
                  <PersonLink {...p.volunteer} />
                  <span className="text-hint">
                    на{" "}
                    <Link to={`/admin/opportunities/${p.opportunity_id}`}>«{p.opportunity_title}»</Link>,{" "}
                    {formatWhen(p.starts_at)}
                  </span>
                </Row>
              )}
            />
          )}
        </Panel>

        <Panel
          title="Не хватает людей на неделе"
          hint="Занятия в ближайшие 7 дней, где есть свободные места."
          dot="bg-cta"
          count={d.understaffed.length}
        >
          {d.understaffed.length === 0 ? (
            <AllClear>На всех занятиях недели люди есть</AllClear>
          ) : (
            <ShortList
              items={d.understaffed}
              render={(u) => (
                <Row
                  key={u.opportunity_id}
                  tone={u.taken === 0 ? "warn" : undefined}
                  side={<LinkButton to={`/admin/search?opportunity=${u.opportunity_id}`}>Подобрать</LinkButton>}
                >
                  <Link
                    to={`/admin/opportunities/${u.opportunity_id}`}
                    className="text-lg font-semibold break-words text-ink underline-offset-4 hover:text-link hover:underline"
                  >
                    {u.title}
                  </Link>
                  <span className="text-hint">{formatWhen(u.starts_at)}</span>
                  <Seats slots={u.slots} taken={u.taken} missing={u.missing} />
                </Row>
              )}
            />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={num(c.volunteers)} label={`${plural(c.volunteers, "волонтёр", "волонтёра", "волонтёров")} в базе`} to="/admin/volunteers" dot="bg-logo-blue" />
        <Stat value={num(c.active)} label="активных — участвовали за 60 дней" to="/admin/analytics" dot="bg-accent" />
        <Stat value={num(c.hours_total)} label={`${plural(Math.round(c.hours_total), "час", "часа", "часов")} волонтёрства всего`} dot="bg-logo-berry" />
        <Stat value={num(c.hours_month)} label={`${plural(Math.round(c.hours_month), "час", "часа", "часов")} в этом месяце`} dot="bg-pop" />
      </div>
    </>
  );
}

function Interviews({ d }: { d: DashboardToday }) {
  const overdue = d.interviews.filter((i) => i.overdue).length;
  const today = d.interviews.filter((i) => !i.overdue);
  const needsResult = d.interviews.filter((i) => i.overdue);
  return (
    <>
      <Panel
        title="Собеседования сегодня"
        dot="bg-logo-blue"
        count={today.length}
        hint="Ссылку на видеозвонок можно открыть в новой вкладке."
      >
        {today.length === 0 ? <AllClear>Сегодня собеседований нет</AllClear> : <InterviewList items={today} />}
      </Panel>
      {needsResult.length > 0 && (
        <Panel
          title="Нужно записать итог"
          dot="bg-cta"
          count={needsResult.length}
          hint={`${overdue} ${plural(overdue, "собеседование прошло", "собеседования прошли", "собеседований прошло")} без итога.`}
        >
          <InterviewList items={needsResult} />
        </Panel>
      )}
    </>
  );
}

function InterviewList({ items }: { items: DashboardToday["interviews"] }) {
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {items.map((i) => (
        <li key={i.interview_id} className={`flex flex-col gap-3 rounded-2xl px-4 py-3 ${i.overdue ? "bg-[color-mix(in_srgb,var(--p-cta)_10%,var(--p-page))]" : "bg-page"}`}>
          <div className="flex items-center gap-4">
            <span className="font-display text-2xl font-semibold tabular-nums">{timeOf(i.starts_at)}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <PersonLink {...i.volunteer} />
              {i.overdue ? <span className="font-medium">⚠ {dayLabel(i.starts_at)}</span> : <span className="text-hint">видеозвонок на сайте</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!i.overdue && isToday(i.starts_at) && (
              <LinkButton to={coordinatorCallUrl(i.token, i.interview_id, i.volunteer.id)} newTab>Открыть звонок</LinkButton>
            )}
            {i.overdue && (
              <LinkButton to={`/admin/volunteers/${i.volunteer.id}#interview`} variant="secondary">Записать итог</LinkButton>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** Просроченное: «время прошло» (сегодня) или «было 20 октября, 16:00». */
function dayLabel(iso: string): string {
  return isToday(iso) ? "время прошло" : `было ${formatWhen(iso)}`;
}

/** Места на занятии кружками: занятые — зелёные, свободные — пустые. */
function Seats(props: { slots: number; taken: number; missing: number }) {
  const many = props.slots > 10;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      {!many && (
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: props.slots }, (_, k) => (
            <span
              key={k}
              className={`size-3.5 rounded-full ${k < props.taken ? "bg-accent" : "border-2 border-cta bg-page"}`}
            />
          ))}
        </span>
      )}
      <span className="font-medium">
        не хватает {props.missing} из {props.slots}
      </span>
    </span>
  );
}

function Stat(props: { value: string; label: string; to?: string; dot: string }) {
  const body: ReactNode = (
    <>
      <span className={`size-3 rounded-full ${props.dot}`} aria-hidden="true" />
      <span className="font-display text-4xl font-semibold tracking-tight tabular-nums">{props.value}</span>
      <span className="leading-snug text-hint">{props.label}</span>
    </>
  );
  const cls = "flex h-full flex-col gap-2 rounded-[1.75rem] bg-surface p-5";
  if (!props.to) return <div className={cls}>{body}</div>;
  return (
    <Link to={props.to} className={`${cls} transition hover:bg-soft`}>
      {body}
    </Link>
  );
}
