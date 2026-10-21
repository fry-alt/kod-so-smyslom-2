import { backend } from "../../backend";
import { AVAILABILITY, OCCUPATION, REGION, STATUS, STATUS_COLOR } from "../../labels";
import { Badge, Card, ErrorBox, Link, Loading, Todo, useLoad } from "../../ui";

export default function VolunteerCard(props: { id: number }) {
  const { data: v, error, loading, reload } = useLoad(() => backend.get(props.id), [props.id]);
  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/volunteers">← База волонтёров</Link>
      <Todo task="T-09">Смена статуса, часы и заметки — там.</Todo>
      {loading && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {v && (
        <>
          <h1 className="text-3xl font-bold">{v.name}</h1>
          <Card className="flex flex-col gap-2">
            <div>
              <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge>
            </div>
            <p>Контакт: {v.contact}</p>
            <p className="text-hint">
              {OCCUPATION[v.answers.occupation]} · {REGION[v.answers.region]} ·{" "}
              {v.answers.availability.map((a) => AVAILABILITY[a]).join(", ")}
            </p>
            {v.profile && <p>{v.profile.summary}</p>}
          </Card>
        </>
      )}
    </div>
  );
}
