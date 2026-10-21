// Моя история: на что откликался и куда приглашали, где участвовал и сколько часов набралось.
import type { Opportunity, Participation } from "../../api";
import { backend, getVolunteerId } from "../../backend";
import { PARTICIPATION, PARTICIPATION_COLOR } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, Card, Empty, ErrorBox, formatHours, formatWhen, Loading, useLoad } from "../../ui";

export default function History() {
  const id = getVolunteerId();
  const { data, error, loading, reload } = useLoad(
    () => (id ? Promise.all([backend.myParticipations(id), backend.opportunities(id)]) : Promise.resolve(null)),
    [id],
  );

  if (!id) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl font-bold">Моя история</h1>
        <p>Вы ещё не заполнили анкету.</p>
        <Button wide onClick={() => navigate("/form")}>
          Заполнить анкету
        </Button>
      </div>
    );
  }

  const [mine, list] = data ?? [[], []];
  const when = new Map(list.map((o: Opportunity) => [o.id, o.starts_at]));
  const total = mine.filter((p) => p.status === "attended").reduce((sum, p) => sum + p.hours, 0);
  const attended = mine.filter((p) => p.status === "attended").length;
  // сначала ближайшие и свежие
  const sorted = [...mine].sort((a, b) => (when.get(b.opportunity_id) ?? b.created_at).localeCompare(when.get(a.opportunity_id) ?? a.created_at));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Моя история</h1>
      {loading && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {data && (
        <>
          <Card className="flex flex-col gap-1">
            <p className="text-hint">Волонтёрских часов за участие</p>
            <p className="text-4xl font-bold">{formatHours(total)} ч</p>
            <p className="text-hint">Участвовали в делах фонда: {attended}</p>
          </Card>
          {sorted.length === 0 ? (
            <Empty>Здесь появятся ваши отклики и участия. Выберите, куда пойти, — и мы сохраним историю.</Empty>
          ) : (
            sorted.map((p) => <HistoryItem key={p.id} p={p} startsAt={when.get(p.opportunity_id)} />)
          )}
        </>
      )}
      <Button wide variant="secondary" onClick={() => navigate("/opportunities")}>
        Куда можно пойти
      </Button>
    </div>
  );
}

function HistoryItem(props: { p: Participation; startsAt?: string }) {
  const { p } = props;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className={PARTICIPATION_COLOR[p.status]}>{PARTICIPATION[p.status]}</Badge>
        {p.status === "attended" && <span className="font-semibold">+{formatHours(p.hours)} ч</span>}
      </div>
      <p className="text-lg font-semibold">{p.opportunity_title || "Дело фонда"}</p>
      {props.startsAt && <p className="text-hint">🗓 {formatWhen(props.startsAt)}</p>}
      {p.status === "invited" && (
        <div>
          <Button variant="secondary" onClick={() => navigate("/opportunities")}>
            Ответить на приглашение
          </Button>
        </div>
      )}
    </Card>
  );
}
