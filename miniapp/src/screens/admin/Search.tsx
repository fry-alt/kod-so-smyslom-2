// Умный поиск (T-08) — /admin/search (главный экран кабинета — «Сводка», T-69).
// Координатор пишет запрос своими словами → видит, как система его поняла, и топ кандидатов.
// Открыт из возможности (/admin/search?opportunity=3) — подбор под неё и кнопка «Пригласить».
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { Candidate, Opportunity, ParsedQuery, Role, SearchRequest, SearchResponse, VolunteerStatus } from "../../api";
import { backend } from "../../backend";
import { AVAILABILITY, FORMAT, OCCUPATION, REGION, REGULARITY, STATUS, STATUS_COLOR } from "../../labels";
import { navigate, useSearchParam } from "../../router";
import { Badge, Button, Card, Chips, Contact, Empty, ErrorBox, errorText, inputClass, Link, Loading } from "../../ui";

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
    if (!opportunityId) return;
    backend
      .opportunities()
      .then((list) => setOpportunity(list.find((o) => o.id === opportunityId) ?? null))
      .catch(() => setOpportunity(null));
    run({ query: "", opportunity_id: opportunityId });
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
          <h1 className="text-3xl font-bold">Кого ищем?</h1>
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
        <Button type="submit" loading={loading}>
          Найти
        </Button>
      </form>

      {!opportunityId && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuery(q);
                  run({ query: q });
                }}
                className="rounded-full border border-line px-4 py-2 text-left hover:border-accent"
              >
                {q}
              </button>
            ))}
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-hint">Или найти под роль:</span>
              {roles.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  title={r.description}
                  onClick={() => {
                    setQuery("");
                    run({ query: "", role_code: r.code });
                  }}
                  className="rounded-full bg-surface px-4 py-2 hover:bg-accent hover:text-accent-text"
                >
                  {r.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-semibold">
          Показывать только: <span className="font-normal text-hint">{statuses.length ? "" : "все, кроме «на паузе»"}</span>
        </span>
        <Chips<VolunteerStatus>
          multiple
          options={STATUS_FILTER as Record<VolunteerStatus, string>}
          value={statuses}
          onChange={changeStatuses}
        />
      </div>

      {loading && <Loading text="Ищем подходящих людей — читаем анкеты, это до 10 секунд…" />}
      {error && !loading && (
        <ErrorBox text={`Поиск не удался: ${error}`} onRetry={lastRequest ? () => run(lastRequest) : undefined} />
      )}
      {result && !loading && <Results result={result} opportunity={opportunityId ? opportunity : null} />}
    </div>
  );
}

function OpportunityHeader(props: { opportunity: Opportunity | null }) {
  const o = props.opportunity;
  return (
    <div className="flex flex-col gap-2">
      <Link to="/admin/opportunities">← Возможности</Link>
      <h1 className="text-3xl font-bold">Подбор: {o?.title ?? "…"}</h1>
      {o && (
        <p className="text-hint">
          {new Date(o.starts_at).toLocaleString("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} ·{" "}
          {FORMAT[o.format]} · {o.place} · нужно людей: {Math.max(0, o.slots - o.taken)}
        </p>
      )}
    </div>
  );
}

function Results(props: { result: SearchResponse; opportunity: Opportunity | null }) {
  const { parsed, candidates, total_checked } = props.result;
  const [selected, setSelected] = useState<number[]>([]);
  const [invited, setInvited] = useState<number[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [sent, setSent] = useState(0);
  const opp = props.opportunity;
  const top = useRef<HTMLDivElement>(null);

  // новые результаты — прокрутить к ним, чтобы не искать их ниже подсказок
  useEffect(() => {
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // кто уже откликнулся или приглашён на эту возможность
  useEffect(() => {
    if (!opp) return;
    backend
      .participants(opp.id)
      .then((ps) => setInvited(ps.filter((p) => p.status !== "declined").map((p) => p.volunteer_id)))
      .catch(() => setInvited([]));
  }, [opp]);

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
      <ParsedChips parsed={parsed} />
      {candidates.length === 0 ? (
        <Empty>
          Подходящих волонтёров не нашли среди {total_checked} анкет. Попробуйте описать задачу иначе или снять фильтр по
          статусу.
        </Empty>
      ) : (
        <>
          <p className="text-hint">
            Проверили анкет: {total_checked}. Лучшие совпадения — сверху.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {candidates.map((c) => (
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

/** «Как я понял запрос» — чтобы координатор видел, что система поняла его правильно. */
function ParsedChips({ parsed }: { parsed: ParsedQuery }) {
  const chips: { icon: string; text: string }[] = [
    ...parsed.skills.map((s) => ({ icon: "🛠", text: s })),
    ...parsed.availability.map((a) => ({ icon: "🕒", text: AVAILABILITY[a] })),
    ...(parsed.kind !== "any" ? [{ icon: "🔁", text: REGULARITY[parsed.kind] }] : []),
    ...(parsed.region ? [{ icon: "📍", text: REGION[parsed.region] }] : []),
    ...(parsed.format ? [{ icon: "💻", text: FORMAT[parsed.format] }] : []),
  ];
  return (
    <Card className="flex flex-col gap-2 py-4">
      <span className="font-semibold">Как я понял запрос</span>
      {chips.length === 0 && !parsed.notes ? (
        <span className="text-hint">Особых условий не нашёл — ищу по смыслу всего запроса.</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <Badge key={c.icon + c.text} className="bg-page">
              {c.icon} {c.text}
            </Badge>
          ))}
          {parsed.notes && <Badge className="bg-page">💬 {parsed.notes}</Badge>}
        </div>
      )}
    </Card>
  );
}

function CandidateCard(props: {
  c: Candidate;
  invite: { done: boolean; checked: boolean; toggle: () => void } | null;
}) {
  const { volunteer: v, score, reason, matched_skills, ai } = props.c;
  const barColor = score >= 70 ? "bg-green-600" : score >= 40 ? "bg-amber-500" : "bg-gray-400";
  const open = () => navigate(`/admin/volunteers/${v.id}`);

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
        <p className="text-sm text-hint">⚙️ Оценка без AI — по совпадению навыков и времени (AI сейчас недоступен).</p>
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
        <span className="text-sm text-hint">🕒 {v.answers.availability.map((a) => AVAILABILITY[a]).join(", ") || "время не указано"}</span>
      </div>

      <Contact contact={v.contact} />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={open}>
          Открыть карточку
        </Button>
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
