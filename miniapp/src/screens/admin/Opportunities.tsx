// Возможности фонда: список → «Создать» → карточка с участниками → «Подобрать» в умном поиске.
import type { Opportunity } from "../../api";
import { backend } from "../../backend";
import { FORMAT, REGION } from "../../labels";
import { navigate } from "../../router";
import { Button, Card, Empty, ErrorBox, formatHours, formatWhen, Link, Loading, useLoad } from "../../ui";

export default function AdminOpportunities() {
  const { data, error, loading, reload } = useLoad(() => backend.opportunities());
  const sorted = [...(data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Возможности</h1>
        <Button onClick={() => navigate("/admin/opportunities/new")}>+ Создать возможность</Button>
      </div>
      <p className="text-hint">
        Занятия, события и задачи фонда. Откройте возможность, чтобы подобрать волонтёров и отметить, кто участвовал.
      </p>
      {loading && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {data?.length === 0 && <Empty>Возможностей пока нет. Нажмите «Создать возможность».</Empty>}
      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((o) => (
          <OpportunityTile key={o.id} o={o} />
        ))}
      </div>
    </div>
  );
}

function OpportunityTile({ o }: { o: Opportunity }) {
  const full = o.taken >= o.slots;
  return (
    <Card className="flex flex-col gap-2">
      <Link to={`/admin/opportunities/${o.id}`} className="text-lg font-semibold hover:underline">
        {o.title}
      </Link>
      <p className="text-hint">
        {formatWhen(o.starts_at)} · {FORMAT[o.format]}
        {o.format === "offline" && ` · ${REGION[o.region]}`}
        {o.place && o.format === "offline" && ` · ${o.place}`}
      </p>
      <p>
        <span className={full ? "font-semibold text-green-800" : "font-semibold"}>
          Подтвердили {o.taken} из {o.slots}
        </span>
        <span className="text-hint"> · {formatHours(o.hours)} ч за участие</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => navigate(`/admin/opportunities/${o.id}`)}>
          Участники
        </Button>
        {!full && <Button onClick={() => navigate(`/admin?opportunity=${o.id}`)}>Подобрать</Button>}
      </div>
    </Card>
  );
}
