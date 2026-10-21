// Карточка волонтёра (T-09): анкета, профиль от AI, статус, часы и заметки координатора.
// Собеседование (T-60, T-69): назначить звонок, план от AI и итог — в interview/InterviewBlock.tsx.
// Всё, что меняет координатор, сразу сохраняется на сервере и видно после перезагрузки.
// Заметки — только для фонда: в AI они не отправляются.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { Note, Role, Volunteer, VolunteerStatus } from "../../api";
import { backend } from "../../backend";
import { formatAvailability, FORMAT, OCCUPATION, REGION, REGULARITY, STATUS, STATUS_COLOR } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, Card, Contact, Empty, ErrorBox, errorText, inputClass, Link, Loading, useLoad } from "../../ui";
import InterviewBlock from "./interview/InterviewBlock";

/** Кнопки смены статуса: что делает координатор → какой статус ставим. */
const STATUS_ACTIONS: { status: VolunteerStatus; label: string }[] = [
  { status: "approved", label: "Допущен" },
  { status: "active", label: "Активен" },
  { status: "paused", label: "На паузе" },
];

export default function VolunteerCard(props: { id: number }) {
  const { data, error, loading, reload } = useLoad(() => backend.get(props.id), [props.id]);
  // после сохранения показываем ответ сервера, не перезагружая всю карточку
  const [saved, setSaved] = useState<Volunteer | null>(null);
  const v = saved?.id === props.id ? saved : data;

  // из «Сводки» ведёт ссылка …/volunteers/3#interview — прокручиваем к собеседованию
  useEffect(() => {
    if (v && location.hash === "#interview") document.getElementById("interview")?.scrollIntoView({ block: "start" });
  }, [v?.id]);

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/volunteers">← База волонтёров</Link>
      {loading && <Loading />}
      {error && !loading &&
        (/не найден|not found/i.test(error) ? (
          <ErrorBox text="Такого волонтёра нет в базе." />
        ) : (
          <ErrorBox text={`Не удалось открыть карточку: ${error}`} onRetry={reload} />
        ))}
      {v && !loading && (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold break-words">{v.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge>
              <span className="text-hint">Анкета от {formatDate(v.created_at, false)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Contact contact={v.contact} />
            {/* переписка на сайте: волонтёр ответит из личного кабинета */}
            <Button onClick={() => navigate(`/admin/messages/${v.id}`)}>Написать на сайте</Button>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            {/* на телефоне управление — сверху, на ноутбуке — справа */}
            <div className="flex min-w-0 flex-col gap-5 lg:order-2 lg:col-span-2">
              <StatusCard key={`s${v.id}`} v={v} onSaved={setSaved} />
              <HoursCard key={`h${v.id}`} v={v} onSaved={setSaved} />
              <TrainingCard v={v} />
              <Notes key={`n${v.id}`} id={v.id} />
            </div>
            <div className="flex min-w-0 flex-col gap-5 lg:order-1 lg:col-span-3">
              <InterviewBlock key={`i${v.id}`} v={v} />
              <ProfileCard v={v} />
              <AnswersCard v={v} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusCard(props: { v: Volunteer; onSaved: (v: Volunteer) => void }) {
  const [saving, setSaving] = useState<VolunteerStatus | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function change(status: VolunteerStatus) {
    setSaving(status);
    setError("");
    setDone(false);
    try {
      props.onSaved(await backend.update(props.v.id, { status }));
      setDone(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Статус</h2>
      <p>
        Статус: <Badge className={STATUS_COLOR[props.v.status]}>{STATUS[props.v.status]}</Badge>
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Статус: ${STATUS[props.v.status]}`}>
        {STATUS_ACTIONS.map((a) => {
          const current = props.v.status === a.status;
          return (
            <Button
              key={a.status}
              variant={current ? "primary" : "secondary"}
              loading={saving === a.status}
              disabled={saving !== null}
              ariaPressed={current}
              onClick={() => !current && change(a.status)}
            >
              {current ? `✓ ${a.label}` : a.label}
            </Button>
          );
        })}
      </div>
      {done && <p role="status" className="text-green-800">✓ Статус сохранён</p>}
      {error && <ErrorBox text={`Статус не сохранился: ${error}`} />}
    </Card>
  );
}

function HoursCard(props: { v: Volunteer; onSaved: (v: Volunteer) => void }) {
  const [value, setValue] = useState(hoursText(props.v.hours));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const hours = Number(value.replace(",", ".").trim());
    setDone(false);
    if (value.trim() === "" || !Number.isFinite(hours) || hours < 0) {
      setError("Введите число часов, например 12 или 2,5.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const v = await backend.update(props.v.id, { hours });
      props.onSaved(v);
      setValue(hoursText(v.hours));
      setDone(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold">Часы волонтёрства</h2>
          <span className="text-sm text-hint">Всего часов, которые человек отработал в фонде.</span>
          <div className="flex flex-wrap gap-2">
            <div className="w-32">
              <input
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setDone(false);
                }}
                inputMode="decimal"
                className={`${inputClass} text-lg`}
                aria-label="Часы"
              />
            </div>
            <Button type="submit" loading={saving}>
              Сохранить
            </Button>
          </div>
        </div>
        {done && <p role="status" className="text-green-800">✓ Часы сохранены</p>}
        {error && <p className="font-medium text-red-700">{error}</p>}
      </form>
    </Card>
  );
}

function TrainingCard({ v }: { v: Volunteer }) {
  return (
    <Card className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold">Обучение</h2>
      {v.training_score !== null ? (
        <p>
          Результат тестов: <b className="text-2xl">{v.training_score}%</b>
        </p>
      ) : (
        <p className="text-hint">Ещё не проходил обучение.</p>
      )}
    </Card>
  );
}

/** Профиль, который AI собрал по анкете. Подходящие роли — названиями из справочника ролей. */
function ProfileCard({ v }: { v: Volunteer }) {
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    backend.roles().then(setRoles).catch(() => setRoles([])); // без справочника покажем коды ролей
  }, []);

  const p = v.profile;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Краткий профиль (составлен автоматически)</h2>
      {!p ? (
        <p className="text-hint">Краткий профиль ещё готовится. Ответы волонтёра — ниже.</p>
      ) : (
        <>
          {p.summary && <p>{p.summary}</p>}
          <Tags title="Навыки" items={p.skills} className="bg-page" />
          <Tags title="Интересы" items={p.interests} className="bg-page" />
          <Tags
            title="Подходящие роли"
            items={p.suitable_roles.map((code) => roles.find((r) => r.code === code)?.title ?? code)}
            className="bg-green-100 text-green-900"
          />
        </>
      )}
    </Card>
  );
}

function Tags(props: { title: string; items: string[]; className: string }) {
  if (props.items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-hint">{props.title}</span>
      <div className="flex flex-wrap gap-2">
        {props.items.map((t) => (
          <Badge key={t} className={props.className}>
            {t}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function AnswersCard({ v }: { v: Volunteer }) {
  const a = v.answers;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Ответы анкеты</h2>
      <dl className="flex flex-col gap-4">
        <Answer title="О себе">{a.about}</Answer>
        <Answer title="Что умеет">{a.skills}</Answer>
        <Answer title="Чем хочет помогать">{a.wishes}</Answer>
        <Answer title="Опыт волонтёрства">{a.experience}</Answer>
        <Answer title="Когда может">{formatAvailability(a.availability)}</Answer>
        <Answer title="Формат">{a.formats.map((x) => FORMAT[x]).join(", ")}</Answer>
        <Answer title="Как часто">{REGULARITY[a.regularity]}</Answer>
        <Answer title="Регион">{REGION[a.region]}</Answer>
        <Answer title="Род занятий">{OCCUPATION[a.occupation]}</Answer>
      </dl>
    </Card>
  );
}

function Answer(props: { title: string; children: ReactNode }) {
  const empty = props.children === "" || props.children == null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm font-semibold text-hint">{props.title}</dt>
      <dd className="break-words whitespace-pre-line">{empty ? <span className="text-hint">—</span> : props.children}</dd>
    </div>
  );
}

/** Заметки координатора — история взаимодействия. Новые сверху. */
function Notes(props: { id: number }) {
  const { data, error, loading, reload } = useLoad(() => backend.notes(props.id), [props.id]);
  const [added, setAdded] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState(loadAuthor);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const notes = [...(data ?? []), ...added].reverse();

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const note = await backend.addNote(props.id, { text: text.trim(), author: author.trim() || undefined });
      setAdded((list) => [...list, note]);
      setText("");
      saveAuthor(author.trim());
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Заметки</h2>
        <p className="text-sm text-hint">История работы с человеком. Видят только сотрудники фонда.</p>
      </div>

      <form onSubmit={add} className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: провела 2 занятия по керамике, всё отлично"
          rows={3}
          maxLength={4000}
          className={inputClass}
          aria-label="Текст заметки"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Ваше имя (необязательно)"
            maxLength={100}
            className={`${inputClass} min-w-0 flex-1 basis-40`}
            aria-label="Кто пишет"
          />
          <Button type="submit" loading={saving} disabled={!text.trim()}>
            Добавить
          </Button>
        </div>
        {saveError && <ErrorBox text={`Заметка не сохранилась: ${saveError}`} />}
      </form>

      {loading && <Loading />}
      {error && !loading && <ErrorBox text={`Не удалось загрузить заметки: ${error}`} onRetry={reload} />}
      {data && !loading && notes.length === 0 && <Empty>Заметок пока нет.</Empty>}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-2xl bg-page px-4 py-3">
              <p className="text-sm text-hint">
                <b className="text-ink">{n.author}</b> · {formatDate(n.created_at, true)}
              </p>
              <p className="break-words whitespace-pre-line">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Имя автора заметок запоминаем в браузере, чтобы не вводить каждый раз. */
const AUTHOR_KEY = "note_author";

function loadAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveAuthor(name: string) {
  try {
    if (name) localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}

/** 12.5 → «12,5» — как пишут по-русски. */
function hoursText(hours: number): string {
  return String(hours).replace(".", ",");
}

/** Сервер отдаёт время в UTC, иногда без пометки зоны — тогда добавляем «Z». */
function formatDate(iso: string, withTime: boolean): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
