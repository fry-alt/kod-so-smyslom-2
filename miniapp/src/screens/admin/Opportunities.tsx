import { backend } from "../../backend";
import { FORMAT } from "../../labels";
import { Card, Empty, ErrorBox, Link, Loading, Todo, useLoad } from "../../ui";

export default function AdminOpportunities() {
  const { data, error, loading, reload } = useLoad(() => backend.opportunities());
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Возможности</h1>
      <Todo task="T-23">Создание, «Подобрать», «Пригласить» и участники — там.</Todo>
      {loading && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {data?.length === 0 && <Empty>Возможностей пока нет.</Empty>}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((o) => (
          <Card key={o.id}>
            <p className="text-lg font-semibold">{o.title}</p>
            <p className="text-hint">
              {new Date(o.starts_at).toLocaleDateString("ru", { day: "numeric", month: "long" })} ·{" "}
              {FORMAT[o.format]} · занято {o.taken} из {o.slots}
            </p>
            <Link to={`/admin?opportunity=${o.id}`}>Подобрать волонтёров →</Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
