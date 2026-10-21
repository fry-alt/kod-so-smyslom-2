import { backend } from "../../backend";
import { STATUS, STATUS_COLOR } from "../../labels";
import { Badge, Empty, ErrorBox, Link, Loading, Todo, useLoad } from "../../ui";

export default function Volunteers() {
  const { data, error, loading, reload } = useLoad(() => backend.list());
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">База волонтёров</h1>
      <Todo task="T-09">Таблица с фильтрами и часами — там.</Todo>
      {loading && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {data?.length === 0 && <Empty>В базе пока никого нет.</Empty>}
      <ul className="flex flex-col divide-y divide-line">
        {data?.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <Link to={`/admin/volunteers/${v.id}`}>{v.name}</Link>
            <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
