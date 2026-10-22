// Умный поиск (T-08) — /admin/search (главный экран кабинета — «Сводка», T-69).
// Координатор пишет запрос своими словами → видит, как система его поняла, и топ кандидатов.
// Открыт из возможности (/admin/search?opportunity=3) — подбор под неё и кнопка «Пригласить».
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { Availability, Candidate, Format, Opportunity, ParsedQuery, Regularity, Region, Role, SearchRequest, SearchResponse, VolunteerStatus } from "../../api";
import { backend } from "../../backend";
import { AVAILABILITY, formatAvailability, FORMAT, OCCUPATION, REGION, REGULARITY, STATUS, STATUS_COLOR } from "../../labels";
import { useSearchParam } from "../../router";
import { Badge, Button, ButtonLink, Card, Chips, Contact, Empty, ErrorBox, errorText, inputClass, Link, PageTitle } from "../../ui";

const EXAMPLES = [
  "Фотограф на четверг утром, разово",
  "Кто поможет на керамике в будни днём",
  "Психолог или дефектолог по утрам",
  "Помощь на ярмарке в выходные",
];

/** Статусы, по которым можно отфильтровать кандидатов. Пусто — все, кроме «на паузе». */
const STATUS_FILTER: Partial<Record<VolunteerStatus, string>> = {
  new: STATUS.new,
  training: STATUS.training,
  trained: STATUS.trained,
  approved: STATUS.approved,
  active: STATUS.active,
};

export default function Search() {
  const opportunityId = Number(useSearchParam("opportunity")) || null;

  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<VolunteerStatus[]>([]);
  const [lastRequest, setLastRequest] = useState<SearchRequest | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);

  useEffect(() => {
    backend.roles().then(setRoles).catch(() => setRoles([])); // без ролей поиск всё равно работает
  }, []);

  async function run(req: Omit<SearchRequest, "statuses">, st = statuses) {
    const full: SearchRequest = { ...req, statuses: st, limit: 10 };
    setLastRequest(full);
    setLoading(true);
    setError("");
    try {
      setResult(await backend.search(full));
    } catch (e) {
      setError(errorText(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  // Подбор под возможность — сразу при открытии
  useEffect(() => {
    setOpportunity(null);
    backend
      .opportunities()
      .then((list) => {
        setOpportunities(list);
        setOpportunity(opportunityId ? list.find((o) => o.id === opportunityId) ?? null : null);
      })
      .catch(() => setOpportunity(null));
    if (opportunityId) run({ query: "", opportunity_id: opportunityId });
  }, [opportunityId]); // только при смене возможности, а не при каждом изменении фильтра

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() && !opportunityId) return;
    run({ query: query.trim(), opportunity_id: opportunityId });
  }

  function changeStatuses(st: VolunteerStatus[]) {
    setStatuses(st);
    if (lastRequest) run(lastRequest, st); // фильтр сразу применяется к последнему поиску
  }

  return (
    <div className="flex flex-col gap-6">
      {opportunityId ? (
        <OpportunityHeader opportunity={opportunity} />
      ) : (
        <div>
          <PageTitle>Кого ищем?</PageTitle>
          <p className="mt-1 text-hint">Опишите задачу обычными словами — когда, что нужно уметь, разово или постоянно.</p>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={opportunityId ? "Уточнить подбор (необязательно)" : "Например: фотограф на четверг утром, разово"}
          className={`${inputClass} text-lg`}
          maxLength={1000}
          autoFocus={!opportunityId}
        />
        <Button type="submit" loading={loading} loadingLabel="Ищем…">
          Найти
        </Button>
      </form>

      {loading && (
        <p role="status" aria-live="polite" className="rounded-2xl bg-soft px-4 py-3 text-hint">
          Подбираем волонтёров по анкетам. Обычно это занимает до 10 секунд.
        </p>
      )}

      {!opportunityId && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-hint">Например:</span>
            {EXAMPLES.map((q, index) => (
              <span key={q}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery(q);
                    run({ query: q });
                  }}
                  className="text-link underline-offset-4 hover:underline"
                >
                  {q}
                </button>
                {index < EXAMPLES.length - 1 && <span aria-hidden="true" className="text-hint"> · </span>}
              </span>
            ))}
          </div>
          {roles.length > 0 && (
            <label className="flex flex-col gap-1.5 font-semibold sm:max-w-sm">
              Найти под роль
              <select
                value=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  setQuery("");
                  run({ query: "", role_code: event.target.value });
                }}
                className={inputClass}
              >
                <option value="">Выберите роль</option>
                {roles.map((r) => <option key={r.code} value={r.code}>{r.title}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-semibold">
          Статус: <span className="font-normal text-hint">{statuses.length ? "выбраны отмеченные" : "любой, кроме «На паузе»"}</span>
        </span>
        <Chips<VolunteerStatus>
          multiple
          options={STATUS_FILTER as Record<VolunteerStatus, string>}
          value={statuses}
          onChange={changeStatuses}
        />
      </div>

      {error && !loading && (
        <ErrorBox text={`Поиск не удался: ${error}`} onRetry={lastRequest ? () => run(lastRequest) : undefined} />
      )}
      {result && !loading && (
        <Results
          result={result}
          opportunity={opportunityId ? opportunity : null}
          opportunities={opportunities.filter(
            (o) => new Date(o.starts_at).getTime() > Date.now() && o.slots > o.taken,
          )}
        />
      )}
    </div>
  );
}

function OpportunityHeader(props: { opportunity: Opportunity | null }) {
  const o = props.opportunity;
  return (
    <div className="flex flex-col gap-2">
      <Link to="/admin/opportunities">← Возможности</Link>
      <PageTitle>Подбор: {o?.title ?? "…"}</PageTitle>
      {o && (
        <p className="text-hint">
          {new Date(o.starts_at).toLocaleString("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} ·{" "}
          {FORMAT[o.format]} · {o.place} · нужно людей: {Math.max(0, o.slots - o.taken)}
        </p>
      )}
    </div>
  );
}

function Results(props: { result: SearchResponse; opportunity: Opportunity | null; opportunities: Opportunity[] }) {
  const { parsed, candidates, total_checked } = props.result;
  const [draftParsed, setDraftParsed] = useState(parsed);
  const [activeParsed, setActiveParsed] = useState(parsed);
  const [newSkill, setNewSkill] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [invited, setInvited] = useState<number[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [sent, setSent] = useState(0);
  const [inviteOpportunityId, setInviteOpportunityId] = useState("");
  const opp = props.opportunity ?? props.opportunities.find((item) => String(item.id) === inviteOpportunityId) ?? null;
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftParsed(parsed);
    setActiveParsed(parsed);
    setNewSkill("");
  }, [parsed]);

  const matchingCandidates = candidates.filter((candidate) => matchesParsed(candidate, activeParsed));

  // новые результаты — прокрутить к ним, чтобы не искать их ниже подсказок
  useEffect(() => {
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // кто уже откликнулся или приглашён на эту возможность
  useEffect(() => {
    if (!opp) return;
    setInvited([]);
    backend
      .participants(opp.id)
      .then((ps) => setInvited(ps.filter((p) => p.status !== "declined").map((p) => p.volunteer_id)))
      .catch(() => setInvited([]));
  }, [opp?.id]);

  async function invite() {
    if (!opp || selected.length === 0) return;
    setInviting(true);
    setInviteError("");
    try {
      await backend.invite(opp.id, selected);
      setInvited((list) => [...list, ...selected]);
      setSent(selected.length);
      setSelected([]);
    } catch (e) {
      setInviteError(errorText(e));
    } finally {
      setInviting(false);
    }
  }

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-4">
      <ParsedEditor
        parsed={draftParsed}
        newSkill={newSkill}
        setNewSkill={setNewSkill}
        onChange={setDraftParsed}
        onApply={() => setActiveParsed(draftParsed)}
      />
      {activeParsed !== parsed && (
        <p className="text-sm text-hint">
          Уточнение применено к уже подобранным кандидатам. Повторный разбор запроса пока не поддерживается API.
        </p>
      )}
      {matchingCandidates.length === 0 ? (
        <Empty>
          {candidates.length === 0
            ? `Подходящих волонтёров не нашли среди ${total_checked} анкет. Попробуйте изменить запрос или фильтр статуса.`
            : "Среди показанных кандидатов нет совпадений. Снимите часть условий или отредактируйте разбор запроса."}
        </Empty>
      ) : (
        <>
          <p className="text-hint">
            Проверили анкет: {total_checked}. По текущим условиям подходят {matchingCandidates.length} из {candidates.length} показанных кандидатов.
          </p>
          {!props.opportunity && (
            props.opportunities.length > 0 ? (
              <label className="flex flex-col gap-2 font-semibold">
                На какое занятие пригласить?
                <select
                  value={inviteOpportunityId}
                  onChange={(event) => {
                    setInviteOpportunityId(event.target.value);
                    setSelected([]);
                    setSent(0);
                  }}
                  className="min-h-12 rounded-2xl border-2 border-[color-mix(in_srgb,var(--p-ink)_55%,transparent)] bg-page px-4 py-3 font-normal"
                >
                  <option value="">Выберите занятие</option>
                  {props.opportunities.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {new Date(item.starts_at).toLocaleDateString("ru", { day: "numeric", month: "long" })}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="rounded-2xl bg-soft px-4 py-3 text-hint">
                Чтобы пригласить человека, сначала создайте занятие в разделе «Занятия и события».
              </p>
            )
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {matchingCandidates.map((c) => (
              <CandidateCard
                key={c.volunteer.id}
                c={c}
                invite={
                  opp
                    ? {
                        done: invited.includes(c.volunteer.id),
                        checked: selected.includes(c.volunteer.id),
                        toggle: () =>
                          setSelected((s) =>
                            s.includes(c.volunteer.id) ? s.filter((x) => x !== c.volunteer.id) : [...s, c.volunteer.id],
                          ),
                      }
                    : null
                }
              />
            ))}
          </div>
        </>
      )}
      {opp && sent > 0 && selected.length === 0 && (
        <p role="status" className="rounded-2xl bg-green-100 px-4 py-3 text-green-900">
          ✓ Пригласили: {sent}. Волонтёры увидят приглашение в приложении и подтвердят участие.
        </p>
      )}
      {opp && (selected.length > 0 || inviteError) && (
        <div className="sticky bottom-4 flex flex-col gap-2 rounded-3xl bg-ink/90 p-3 text-page shadow-lg sm:flex-row sm:items-center">
          <span className="flex-1 px-2">Выбрано: {selected.length}</span>
          {inviteError && <span className="px-2 text-red-200">Не получилось: {inviteError}</span>}
          <Button loading={inviting} onClick={invite}>
            Пригласить выбранных
          </Button>
        </div>
      )}
    </div>
  );
}

/** Редактируемые условия поиска. Изменения применяются к уже возвращённым кандидатам без повторного разбора запроса. */
function ParsedEditor(props: {
  parsed: ParsedQuery;
  newSkill: string;
  setNewSkill: (value: string) => void;
  onChange: (value: ParsedQuery) => void;
  onApply: () => void;
}) {
  const p = props.parsed;
  function change(next: Partial<ParsedQuery>) {
    props.onChange({ ...p, ...next });
  }
  return (
    <Card className="flex flex-col gap-4 py-4">
      <div>
        <span className="font-semibold">Как я понял запрос</span>
        <p className="mt-1 text-sm text-hint">Измените условия и примените их к найденным кандидатам.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 font-semibold sm:col-span-2">
          Навыки
          <div className="flex flex-wrap gap-2">
            {p.skills.map((skill) => (
              <button key={skill} type="button" onClick={() => change({ skills: p.skills.filter((item) => item !== skill) })}
                aria-label={`Убрать навык ${skill}`} className="rounded-full bg-page px-3 py-2 text-left">
                🛠 {skill} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
          <span className="flex gap-2">
            <input value={props.newSkill} onChange={(event) => props.setNewSkill(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && props.newSkill.trim()) {
                  event.preventDefault();
                  change({ skills: [...p.skills, props.newSkill.trim()] });
                  props.setNewSkill("");
                }
              }} placeholder="Добавить навык" className={inputClass} />
            <Button type="button" variant="secondary" disabled={!props.newSkill.trim()} onClick={() => {
              if (props.newSkill.trim()) change({ skills: [...p.skills, props.newSkill.trim()] });
              props.setNewSkill("");
            }}>Добавить</Button>
          </span>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Регион
          <select value={p.region ?? "any"} onChange={(event) => change({ region: event.target.value === "any" ? null : event.target.value as Region })} className={inputClass}>
            <option value="any">Любой регион</option>
            {Object.entries(REGION).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Формат
          <select value={p.format ?? "any"} onChange={(event) => change({ format: event.target.value === "any" ? null : event.target.value as Format })} className={inputClass}>
            <option value="any">Любой</option>
            {Object.entries(FORMAT).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Регулярность
          <select value={p.kind} onChange={(event) => change({ kind: event.target.value as Regularity })} className={inputClass}>
            {Object.entries(REGULARITY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">Когда может</span>
        <Chips<Availability> multiple options={AVAILABILITY} value={p.availability} onChange={(availability) => change({ availability })} />
      </div>
      {p.notes && <p className="text-sm text-hint">Дополнительно: {p.notes}</p>}
      <div>
        <Button onClick={props.onApply}>Применить условия</Button>
      </div>
    </Card>
  );
}

function matchesParsed(candidate: Candidate, parsed: ParsedQuery): boolean {
  const v = candidate.volunteer;
  const searchableSkills = [
    ...(v.profile?.skills ?? []),
    ...(v.profile?.interests ?? []),
    v.answers.skills,
  ].join(" ").toLocaleLowerCase("ru");
  if (parsed.skills.some((skill) => !searchableSkills.includes(skill.toLocaleLowerCase("ru")))) return false;
  if (parsed.availability.length && !parsed.availability.some((time) => v.answers.availability.includes(time))) return false;
  if (parsed.region && v.answers.region !== parsed.region) return false;
  if (parsed.format && !v.answers.formats.includes(parsed.format)) return false;
  if (parsed.kind !== "any" && v.answers.regularity !== parsed.kind) return false;
  return true;
}

function CandidateCard(props: {
  c: Candidate;
  invite: { done: boolean; checked: boolean; toggle: () => void } | null;
}) {
  const { volunteer: v, score, reason, matched_skills, ai } = props.c;
  const barColor = score >= 70 ? "bg-green-600" : score >= 40 ? "bg-amber-500" : "bg-gray-400";
  const volunteerPath = `/admin/volunteers/${v.id}`;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link to={`/admin/volunteers/${v.id}`} className="text-xl font-semibold text-link hover:underline">
            {v.name}
          </Link>
          <span className="text-hint">
            {OCCUPATION[v.answers.occupation]} · {REGION[v.answers.region]}
          </span>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold">{score}</span>
          <span className="text-hint">/100</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-page" aria-label={`Совпадение ${score} из 100`}>
        <div className={`h-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>

      <p>{reason}</p>
      {!ai && (
        <p className="text-sm text-hint">Автоматическая оценка недоступна — совпадение рассчитано по навыкам и времени.</p>
      )}

      {matched_skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {matched_skills.map((s) => (
            <Badge key={s} className="bg-green-100 text-green-900">
              ✓ {s}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge>
        <Badge className="bg-page">
          {v.training_score !== null ? `Обучение: ${v.training_score}%` : "Обучение не проходил"}
        </Badge>
        <span className="text-sm text-hint">🕒 {formatAvailability(v.answers.availability) || "время не указано"}</span>
      </div>

      <Contact contact={v.contact} />

      <div className="flex flex-wrap gap-2">
        <ButtonLink to={volunteerPath}>
          Открыть карточку
        </ButtonLink>
        {props.invite &&
          (props.invite.done ? (
            <Badge className="self-center bg-green-100 text-green-900">Приглашён</Badge>
          ) : (
            <Button variant={props.invite.checked ? "primary" : "secondary"} onClick={props.invite.toggle}>
              {props.invite.checked ? "✓ Выбран" : "Пригласить"}
            </Button>
          ))}
      </div>
    </Card>
  );
}
