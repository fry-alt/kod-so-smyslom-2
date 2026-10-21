// Карточка возможности: кто откликнулся, кого пригласили, кто подтвердил и кто участвовал.
// «Участвовал» начисляет волонтёру часы возможности.
import { useState } from "react";

import type { Participation, ParticipationStatus } from "../../api";
import { backend } from "../../backend";
import { FORMAT, PARTICIPATION, PARTICIPATION_COLOR, REGION } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, Card, Empty, ErrorBox, errorText, formatHours, formatWhen, Link, Loading, useLoad } from "../../ui";

/** Какие кнопки показать для участника в каждом статусе. */
const ACTIONS: Record<ParticipationStatus, { status: ParticipationStatus; label: string }[]> = {
  responded: [
    { status: "confirmed", label: "Подтвердить" },
    { status: "attended", label: "Отметить участие" },
    { status: "declined", label: "Отклонить отклик" },
  ],
  invited: [
    { status: "confirmed", label: "Подтвердить" },
    { status: "attended", label: "Отметить участие" },
    { status: "declined", label: "Отклонить отклик" },
  ],
  confirmed: [
    { status: "attended", label: "Отметить участие" },
    { status: "declined", label: "Отклонить отклик" },
  ],
  attended: [],
  declined: [{ status: "confirmed", label: "Подтвердить" }],
};

/** Порядок в списке: сначала те, с кем нужно что-то сделать. */
const ORDER: ParticipationStatus[] = ["responded", "invited", "confirmed", "attended", "declined"];

export default function OpportunityCard(props: { id: number }) {
  const { data, error, loading, reload } = useLoad(
    () => Promise.all([backend.opportunities(), backend.participants(props.id)]),
    [props.id],
  );

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox text={error} onRetry={reload} />;
  if (!data) return null;

  const [list, participants] = data;
  const o = list.find((x) => x.id === props.id);
  if (!o) {
    return (
      <div className="flex flex-col gap-3">
      <Link to="/admin/opportunities">← Занятия</Link>
      <Empty>Такого занятия нет — возможно, его удалили.</Empty>
      </div>
    );
  }

  const sorted = [...participants].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const count = (s: ParticipationStatus) => participants.filter((p) => p.status === s).length;
  const full = o.taken >= o.slots;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/opportunities">← Занятия</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">{o.title}</h1>
          <p className="text-hint">
            {formatWhen(o.starts_at)} · {FORMAT[o.format]}
            {o.format === "offline" && ` · ${REGION[o.region]}`}
            {o.place && ` · ${o.place}`} · {formatHours(o.hours)} ч за участие
          </p>
        </div>
        <Button onClick={() => navigate(`/admin/search?opportunity=${o.id}`)}>
          {full ? "Подобрать ещё" : "Подобрать волонтёров"}
        </Button>
      </div>
      {o.description && <p className="max-w-3xl">{o.description}</p>}

      <Card className="flex flex-wrap gap-x-6 gap-y-2">
        <span>
          Нужно людей: <b>{o.slots}</b>
        </span>
        <span className={full ? "text-green-800" : ""}>
          Подтвердили: <b>{o.taken}</b>
        </span>
        <span>
          Приглашены: <b>{count("invited")}</b>
        </span>
        <span>
          Откликнулись: <b>{count("responded")}</b>
        </span>
        <span>
          Участвовали: <b>{count("attended")}</b>
        </span>
      </Card>

      <h2 className="text-2xl font-bold">Участники</h2>
      {error && <ErrorBox text={error} onRetry={reload} />}
      {sorted.length === 0 ? (
        <Empty>
          Пока никто не откликнулся. Нажмите «Подобрать волонтёров» — умный поиск найдёт подходящих, их можно сразу
          пригласить.
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((p) => (
            <ParticipantRow key={p.id} p={p} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParticipantRow(props: { p: Participation; onChange: () => void }) {
  const { p } = props;
  const [busy, setBusy] = useState<ParticipationStatus | null>(null);
  const [error, setError] = useState("");

  async function set(status: ParticipationStatus) {
    setBusy(status);
    setError("");
    try {
      await backend.updateParticipation(p.id, status);
      props.onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
      <div className="flex flex-1 flex-col gap-1">
        <Link to={`/admin/volunteers/${p.volunteer_id}`} className="text-lg font-semibold hover:underline">
          {p.volunteer_name || `Волонтёр №${p.volunteer_id}`}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PARTICIPATION_COLOR[p.status]}>{PARTICIPATION[p.status]}</Badge>
          {p.status === "attended" && <span className="text-hint">начислено {formatHours(p.hours)} ч</span>}
        </div>
        {error && <span className="font-medium text-red-700">⚠️ {error}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => navigate(`/admin/messages/${p.volunteer_id}?about=${p.opportunity_id}`)}>
          Написать
        </Button>
        {ACTIONS[p.status].map((a) => (
          <Button
            key={a.status}
            variant={a.status === "declined" ? "ghost" : a.status === "attended" ? "primary" : "secondary"}
            loading={busy === a.status}
            disabled={!!busy}
            onClick={() => set(a.status)}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
