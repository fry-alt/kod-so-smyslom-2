import { backend, getVolunteerId, setVolunteerId } from "../../backend";
import { STATUS, STATUS_COLOR } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, Card, ErrorBox, Loading, useLoad } from "../../ui";

/** Статус волонтёра: куда он дошёл и что делать дальше. */
export default function Me() {
  const id = getVolunteerId();
  const { data: v, error, loading, reload } = useLoad(
    () => (id ? backend.get(id) : Promise.resolve(null)),
    [id],
  );

  if (!id) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl font-bold">Мой статус</h1>
        <p>Вы ещё не заполнили анкету.</p>
        <Button wide onClick={() => navigate("/form")}>
          Заполнить анкету
        </Button>
      </div>
    );
  }
  if (loading) return <Loading />;
  if (error) {
    // например, анкету удалили или моки сбросились после перезагрузки
    return (
      <div className="flex flex-col gap-4">
        <ErrorBox text={error} onRetry={reload} />
        <Button
          variant="secondary"
          onClick={() => {
            setVolunteerId(null);
            navigate("/form");
          }}
        >
          Заполнить анкету заново
        </Button>
      </div>
    );
  }
  if (!v) return null;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{v.name}</h1>
      <Card className="flex flex-col gap-3">
        <div>
          <Badge className={STATUS_COLOR[v.status]}>{STATUS[v.status]}</Badge>
        </div>
        {v.profile && (
          <div className="flex flex-wrap gap-2">
            {v.profile.skills.map((s) => (
              <Badge key={s} className="bg-page">
                {s}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-hint">
          Волонтёрских часов: <b className="text-ink">{v.hours}</b>
          {v.training_score !== null && (
            <>
              {" "}
              · Балл за обучение: <b className="text-ink">{v.training_score}%</b>
            </>
          )}
        </p>
      </Card>
      <Button wide onClick={() => navigate("/training")}>
        Обучение
      </Button>
      <Button wide variant="secondary" onClick={() => navigate("/opportunities")}>
        Куда можно пойти
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setVolunteerId(null);
          navigate("/");
        }}
      >
        Это не я — выйти
      </Button>
    </div>
  );
}
