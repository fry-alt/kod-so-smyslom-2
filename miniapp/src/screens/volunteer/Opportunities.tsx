import { backend, getVolunteerId } from "../../backend";
import { FORMAT } from "../../labels";
import { Badge, Card, Empty, ErrorBox, Loading, Todo, useLoad } from "../../ui";

export default function Opportunities() {
  const id = getVolunteerId() ?? undefined;
  const { data, error, loading, reload } = useLoad(() => backend.opportunities(id), [id]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Куда можно пойти</h1>
      <Todo task="T-23">Отклик, приглашения и «Моя история» появятся там.</Todo>
      {loading && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {data?.length === 0 && <Empty>Пока нет открытых возможностей.</Empty>}
      {data?.map((o) => (
        <Card key={o.id} className="flex flex-col gap-1">
          {o.recommended && (
            <div>
              <Badge className="bg-accent text-accent-text">Подходит вам</Badge>
            </div>
          )}
          <p className="text-lg font-semibold">{o.title}</p>
          <p className="text-hint">
            {new Date(o.starts_at).toLocaleString("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {FORMAT[o.format]} · {o.place}
          </p>
          <p className="text-hint">
            Мест осталось: {Math.max(0, o.slots - o.taken)} из {o.slots}
          </p>
        </Card>
      ))}
    </div>
  );
}
