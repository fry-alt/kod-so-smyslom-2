import { backend } from "../../backend";
import { Card, ErrorBox, Loading, Todo, useLoad } from "../../ui";

export default function Training() {
  const { data: modules, error, loading, reload } = useLoad(backend.training);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Обучение</h1>
      <Todo task="T-11">Чтение модулей и тест появятся там.</Todo>
      {loading && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {modules?.map((m, i) => (
        <Card key={m.id}>
          <p className="text-sm text-hint">
            Модуль {i + 1}
            {m.required ? " · обязательный" : ""}
          </p>
          <p className="text-lg font-semibold">{m.title}</p>
        </Card>
      ))}
    </div>
  );
}
