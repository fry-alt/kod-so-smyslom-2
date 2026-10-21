// Блок «Собеседование» в карточке волонтёра (T-60, T-69): назначить видеозвонок, список собеседований,
// «Открыть звонок», «Прошло» / «Отменить», план от AI и итог после звонка.
import { useEffect, useState, type FormEvent } from "react";

import type { Interview, InterviewStatus, Role, Volunteer } from "../../../api";
import { backend } from "../../../backend";
import { Badge, Button, Card, Empty, ErrorBox, errorText, formatWhen, inputClass, Loading, useLoad } from "../../../ui";
import { coordinatorCallUrl, LinkButton } from "../parts";
import Plan from "./Plan";
import ResultForm, { ResultSummary } from "./ResultForm";

const STATUS: Record<InterviewStatus, string> = { scheduled: "Назначено", done: "Прошло", canceled: "Отменено" };
const STATUS_COLOR: Record<InterviewStatus, string> = {
  scheduled: "bg-sky-100 text-sky-900",
  done: "bg-emerald-200 text-emerald-950",
  canceled: "bg-gray-200 text-gray-700",
};

export default function InterviewBlock(props: { v: Volunteer }) {
  const { v } = props;
  const { data, error, loading, reload } = useLoad(() => backend.interviews(v.id), [v.id]);
  const [list, setList] = useState<Interview[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => setList(data), [data]);
  useEffect(() => {
    backend.roles().then(setRoles).catch(() => setRoles([])); // без справочника роли в итоге просто не выбрать
  }, []);

  const interviews = list ?? [];
  const upcoming = interviews.some((i) => i.status === "scheduled");
  // план нужен, когда собеседование впереди или человек ещё новичок; иначе — по кнопке
  const planOpen = showPlan || upcoming || v.status === "new";

  function replace(i: Interview) {
    setList((old) => [i, ...(old ?? []).filter((x) => x.id !== i.id)].sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
  }

  return (
    <Card className="flex scroll-mt-4 flex-col gap-5">
      <div id="interview" className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Собеседование</h2>
        <p className="text-sm text-hint">Видеозвонок прямо на сайте. Ссылка уходит волонтёру в Telegram.</p>
      </div>

      <Schedule volunteerId={v.id} onCreated={replace} />

      {loading && !list && <Loading />}
      {error && !list && <ErrorBox text={`Не удалось загрузить собеседования: ${error}`} onRetry={reload} />}
      {list && interviews.length === 0 && <Empty>Собеседований ещё не было.</Empty>}
      {interviews.length > 0 && (
        <ul className="flex flex-col gap-3">
          {interviews.map((i) => (
            <InterviewItem key={i.id} i={i} v={v} roles={roles} onChanged={replace} />
          ))}
        </ul>
      )}

      <div className="border-t border-line pt-4">
        {planOpen ? (
          <Plan volunteerId={v.id} />
        ) : (
          <Button variant="secondary" onClick={() => setShowPlan(true)}>
            Показать план собеседования
          </Button>
        )}
      </div>
    </Card>
  );
}

/** «Назначить»: дата и время → POST /volunteers/{id}/interviews. */
function Schedule(props: { volunteerId: number; onCreated: (i: Interview) => void }) {
  const [when, setWhen] = useState(tomorrowAt(15));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Interview | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!when) return setError("Выберите дату и время.");
    setSaving(true);
    setError("");
    setCreated(null);
    try {
      const i = await backend.scheduleInterview(props.volunteerId, `${when}:00`);
      setCreated(i);
      props.onCreated(i);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={`when-${props.volunteerId}`} className="font-semibold">
        Назначить на
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`when-${props.volunteerId}`}
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className={`${inputClass} w-auto min-w-0 flex-1 basis-52`}
        />
        <Button type="submit" loading={saving}>
          Назначить
        </Button>
      </div>
      {created && (
        <div role="status" className="flex flex-col gap-2 rounded-2xl bg-soft px-4 py-3">
          <span>
            ✓ Собеседование назначено на <b>{formatWhen(created.starts_at)}</b>.{" "}
            {created.notified ? "Ссылка ушла волонтёру в Telegram." : "Telegram у волонтёра нет — отправьте ссылку сами."}
          </span>
          {!created.notified && <CopyLink token={created.token} />}
        </div>
      )}
      {error && <ErrorBox text={`Не удалось назначить: ${error}`} />}
    </form>
  );
}

function InterviewItem(props: { i: Interview; v: Volunteer; roles: Role[]; onChanged: (i: Interview) => void }) {
  const { i } = props;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState<InterviewStatus | null>(null);
  const [error, setError] = useState("");
  const past = new Date(i.starts_at).getTime() < Date.now();

  async function setStatus(status: InterviewStatus) {
    setSaving(status);
    setError("");
    try {
      props.onChanged(await backend.updateInterview(i.id, status));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-page p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{formatWhen(i.starts_at)}</span>
        <Badge className={STATUS_COLOR[i.status]}>{STATUS[i.status]}</Badge>
        {i.status === "scheduled" && past && !i.result && <Badge className="bg-pop/30">Время прошло — запишите итог</Badge>}
      </div>

      {i.status === "scheduled" && (
        <>
          <div className="flex flex-wrap gap-2">
            <LinkButton to={coordinatorCallUrl(i.token, i.id, i.volunteer_id)} newTab>
              Открыть звонок
            </LinkButton>
            <Button variant="secondary" onClick={() => setStatus("done")} loading={saving === "done"} disabled={saving !== null}>
              Прошло
            </Button>
            <Button variant="secondary" onClick={() => setStatus("canceled")} loading={saving === "canceled"} disabled={saving !== null}>
              Отменить
            </Button>
          </div>
          <p className="text-sm text-hint">
            {i.notified ? "Ссылка ушла волонтёру в Telegram." : "Telegram у волонтёра нет — отправьте ссылку сами."}
          </p>
          <CopyLink token={i.token} />
        </>
      )}
      {error && <ErrorBox text={error} />}

      {i.status !== "canceled" &&
        (editing ? (
          <div className="rounded-2xl border-2 border-accent bg-surface p-4">
            <h3 className="mb-3 text-lg font-semibold">Итог собеседования</h3>
            <ResultForm
              interviewId={i.id}
              initial={i.result}
              roles={props.roles}
              suggestedRoles={props.v.profile?.suitable_roles}
              onSaved={(x) => {
                props.onChanged(x);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : i.result ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">Итог</span>
              <Button variant="ghost" onClick={() => setEditing(true)}>
                Изменить
              </Button>
            </div>
            <ResultSummary result={i.result} roles={props.roles} />
          </div>
        ) : (
          (i.status === "done" || past) && (
            <div>
              <Button onClick={() => setEditing(true)}>Записать итог</Button>
            </div>
          )
        ))}
    </li>
  );
}

/** Ссылка для волонтёра (без ?as=coordinator) — скопировать и отправить самим. */
function CopyLink(props: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/call/${encodeURIComponent(props.token)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер обмена недоступен — ссылка видна на экране */
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="min-w-0 break-all text-hint">{url}</span>
      <button type="button" onClick={copy} className="font-semibold text-link hover:underline">
        {copied ? "Скопировано ✓" : "Скопировать ссылку для волонтёра"}
      </button>
    </div>
  );
}

/** Значение для <input type="datetime-local">: завтра в hour:00 по местному времени. */
function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}
