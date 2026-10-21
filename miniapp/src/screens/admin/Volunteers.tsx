// База волонтёров (T-09): все анкеты с фильтром по статусу.
// На ноутбуке — таблица, на телефоне — карточки. Клик по человеку → его карточка.
import { useMemo, useState, type MouseEvent } from "react";

import type { Availability, Region, Volunteer, VolunteerStatus } from "../../api";
import { backend } from "../../backend";
import { AVAILABILITY, formatAvailability, REGION, STATUS, STATUS_COLOR } from "../../labels";
import { navigate } from "../../router";
import { Badge, Chips, Empty, ErrorBox, inputClass, Link, Loading, useLoad } from "../../ui";

type Filter = VolunteerStatus | "all";

const FILTER: Record<Filter, string> = { all: "Все", ...STATUS };
type SortBy = "hours" | "created_at";

/** Сколько навыков показывать в строке — остальные в карточке. */
const MAX_SKILLS = 4;

export default function Volunteers() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");
  const [availability, setAvailability] = useState<Availability | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [descending, setDescending] = useState(true);
  const status = filter === "all" ? undefined : filter;
  const { data, error, loading, reload } = useLoad(() => backend.list(status), [status]);
  const list = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    return [...(data ?? [])]
      .filter((v) => !needle || `${v.name} ${v.contact}`.toLocaleLowerCase("ru").includes(needle))
      .filter((v) => region === "all" || v.answers.region === region)
      .filter((v) => availability === "all" || v.answers.availability.includes(availability))
      .sort((a, b) => {
        const order = sortBy === "hours"
          ? a.hours - b.hours
          : a.created_at.localeCompare(b.created_at);
        return descending ? -order : order;
      });
  }, [data, search, region, availability, sortBy, descending]);

  function toggleSort(field: SortBy) {
    if (sortBy === field) setDescending((value) => !value);
    else {
      setSortBy(field);
      setDescending(true);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold">База волонтёров</h1>
        <p className="mt-1 text-hint">Все анкеты. Нажмите на человека, чтобы открыть карточку, сменить статус или добавить заметку.</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-semibold">Статус</span>
        <Chips<Filter> options={FILTER} value={[filter]} onChange={(v) => setFilter(v[0])} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 font-semibold">
          Найти по имени или контакту
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Имя, телефон или почта"
            className={inputClass}
            type="search"
          />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Регион
          <select value={region} onChange={(event) => setRegion(event.target.value as Region | "all")} className={inputClass}>
            <option value="all">Все регионы</option>
            {Object.entries(REGION).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Когда может
          <select value={availability} onChange={(event) => setAvailability(event.target.value as Availability | "all")} className={inputClass}>
            <option value="all">Любое время</option>
            {Object.entries(AVAILABILITY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>

      {loading && <Loading />}
      {error && !loading && <ErrorBox text={`Не удалось загрузить базу: ${error}`} onRetry={reload} />}
      {data && !loading && !error && (
        list.length === 0 ? (
          <Empty>
            {data.length === 0
              ? filter === "all"
                ? "В базе пока никого нет. Анкеты появятся, когда волонтёры их заполнят."
                : `Волонтёров со статусом «${STATUS[filter]}» нет.`
              : "По этим условиям никого не нашли. Измените поиск или фильтры."}
          </Empty>
        ) : (
          <>
            <p className="text-hint">Найдено: {list.length} из {data.length}</p>
            <Table list={list} sortBy={sortBy} descending={descending} onSort={toggleSort} />
            <CardList list={list} />
          </>
        )
      )}
    </div>
  );
}

/** Ноутбук: таблица. Вся строка кликабельна, имя — обычная ссылка (можно открыть в новой вкладке). */
function Table({ list, sortBy, descending, onSort }: {
  list: Volunteer[];
  sortBy: SortBy;
  descending: boolean;
  onSort: (field: SortBy) => void;
}) {
  function open(e: MouseEvent, id: number) {
    if ((e.target as HTMLElement).closest("a")) return; // по ссылке переход уже сделан
    navigate(`/admin/volunteers/${id}`);
  }
  return (
    <table className="hidden w-full border-collapse text-left lg:table">
      <thead>
        <tr className="border-b border-line text-hint">
          <th className="py-3 pr-4 font-medium">Имя</th>
          <th className="py-3 pr-4 font-medium">Статус</th>
          <th className="py-3 pr-4 font-medium">Навыки</th>
          <th className="py-3 pr-4 font-medium">Когда может</th>
          <th className="py-3 pr-4 font-medium">Обучение</th>
          <th className="py-3 text-right font-medium">
            <button type="button" onClick={() => onSort("hours")} aria-label={`Сортировать по часам ${sortBy === "hours" ? (descending ? "по убыванию" : "по возрастанию") : "по убыванию"}`}>
              Часы {sortBy === "hours" ? (descending ? "↓" : "↑") : "↕"}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {list.map((v) => (
          <tr
            key={v.id}
            onClick={(e) => open(e, v.id)}
            className="cursor-pointer border-b border-line align-top hover:bg-surface"
          >
            <td className="py-3 pr-4">
              <Link to={`/admin/volunteers/${v.id}`} className="font-semibold text-link hover:underline">
                {v.name}
              </Link>
            </td>
            <td className="py-3 pr-4">
              <Badge className={`whitespace-nowrap ${STATUS_COLOR[v.status]}`}>{STATUS[v.status]}</Badge>
            </td>
            <td className="py-3 pr-4">
              <Skills v={v} />
            </td>
            <td className="py-3 pr-4">{availability(v)}</td>
            <td className="py-3 pr-4 whitespace-nowrap">{training(v)}</td>
            <td className="py-3 text-right font-semibold">{v.hours.toLocaleString("ru")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Телефон и планшет: карточки, без горизонтальной прокрутки. */
function CardList({ list }: { list: Volunteer[] }) {
  return (
    <ul className="flex flex-col gap-3 lg:hidden">
      {list.map((v) => (
        <li key={v.id}>
          <Link
            to={`/admin/volunteers/${v.id}`}
            className="flex flex-col gap-2 rounded-3xl bg-surface p-4 transition active:scale-[.99]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xl font-semibold text-link">{v.name}</span>
              <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge>
            </div>
            <Skills v={v} />
            <span className="text-hint">🕒 {availability(v)}</span>
            <span className="text-hint">
              🎓 {training(v)} · ⏱ Часов: <b className="text-ink">{v.hours.toLocaleString("ru")}</b>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Skills({ v }: { v: Volunteer }) {
  if (!v.profile) return <span className="text-hint">AI ещё не разобрал анкету</span>;
  const skills = v.profile.skills;
  if (skills.length === 0) return <span className="text-hint">—</span>;
  const rest = skills.length - MAX_SKILLS;
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.slice(0, MAX_SKILLS).map((s) => (
        <Badge key={s} className="bg-page" title={s}>
          <span className="line-clamp-2">{s}</span>
        </Badge>
      ))}
      {rest > 0 && <span className="self-center text-sm text-hint">ещё {rest}</span>}
    </div>
  );
}

function availability(v: Volunteer): string {
  return formatAvailability(v.answers.availability) || "не указано";
}

function training(v: Volunteer): string {
  return v.training_score !== null ? `${v.training_score}%` : "не проходил";
}
