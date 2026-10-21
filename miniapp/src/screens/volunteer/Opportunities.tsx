// Куда можно пойти: приглашения координатора сверху, ниже — лента возможностей с откликом.
import { useState } from "react";

import type { Opportunity, Participation, ParticipationStatus } from "../../api";
import { backend, getVolunteerId } from "../../backend";
import { FORMAT, REGION } from "../../labels";
import { navigate } from "../../router";
import { Badge, Button, Card, Empty, ErrorBox, errorText, formatHours, formatWhen, Loading, useLoad } from "../../ui";

/** Что видит волонтёр, если уже откликнулся или приглашён. */
const MY_STATUS: Record<ParticipationStatus, string> = {
  responded: "Вы откликнулись — координатор свяжется с вами",
  invited: "Вас пригласили",
  confirmed: "✓ Вы записаны",
  attended: "✓ Вы участвовали",
  declined: "Вы отказались",
};

export default function Opportunities() {
  const id = getVolunteerId();
  const [notice, setNotice] = useState("");
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        backend.opportunities(id ?? undefined),
        id ? backend.myParticipations(id) : Promise.resolve([] as Participation[]),
      ]),
    [id],
  );

  const [list, mine] = data ?? [[], []];
  const byDate = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const invites = byDate.filter((o) => o.my_status === "invited");
  const feed = byDate.filter((o) => o.my_status !== "invited");
  // после отклика или ответа на приглашение карточка переезжает — говорим, что получилось
  const done = (text: string) => {
    setNotice(text);
    reload();
    window.scrollTo(0, 0);
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Куда можно пойти</h1>

      {!id && (
        <Card className="flex flex-col gap-3">
          <p>Чтобы откликнуться и получать приглашения, сначала заполните анкету — это 5 минут.</p>
          <Button wide onClick={() => navigate("/form")}>
            Заполнить анкету
          </Button>
        </Card>
      )}

      {notice && (
        <p role="status" className="rounded-2xl bg-green-100 px-4 py-3 text-lg text-green-900">
          {notice}
        </p>
      )}
      {loading && !data && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}

      {data && invites.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">Вас приглашают</h2>
          {invites.map((o) => (
            <OpportunityItem
              key={o.id}
              o={o}
              participation={mine.find((p) => p.opportunity_id === o.id)}
              onDone={done}
              invite
            />
          ))}
        </section>
      )}

      {data && (
        <section className="flex flex-col gap-3">
          {invites.length > 0 && <h2 className="text-2xl font-bold">Все возможности</h2>}
          {feed.length === 0 ? (
            <Empty>Пока нет открытых возможностей. Загляните позже — координатор добавит новые.</Empty>
          ) : (
            feed.map((o) => (
              <OpportunityItem
                key={o.id}
                o={o}
                participation={mine.find((p) => p.opportunity_id === o.id)}
                onDone={done}
              />
            ))
          )}
        </section>
      )}

      {id && (
        <Button wide variant="secondary" onClick={() => navigate("/history")}>
          Моя история и часы
        </Button>
      )}
    </div>
  );
}

function OpportunityItem(props: {
  o: Opportunity;
  participation?: Participation;
  onDone: (notice: string) => void;
  invite?: boolean;
}) {
  const { o, participation } = props;
  const volunteerId = getVolunteerId();
  const left = Math.max(0, o.slots - o.taken);
  const [busy, setBusy] = useState<"" | "respond" | "confirm" | "decline">("");
  const [error, setError] = useState("");

  async function act(kind: "respond" | "confirm" | "decline") {
    if (!volunteerId) return;
    setBusy(kind);
    setError("");
    try {
      if (kind === "respond") await backend.respond(o.id, volunteerId);
      else if (!participation) throw new Error("Не нашли ваше приглашение. Обновите страницу.");
      else await backend.updateParticipation(participation.id, kind === "confirm" ? "confirmed" : "declined");
      props.onDone(
        {
          respond: `Вы откликнулись на «${o.title}». Координатор свяжется с вами.`,
          confirm: `✓ Вы записаны: «${o.title}», ${formatWhen(o.starts_at)}. Ждём вас!`,
          decline: `Вы отказались от «${o.title}». Спасибо, что предупредили.`,
        }[kind],
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className={`flex flex-col gap-2 ${props.invite ? "ring-2 ring-accent" : ""}`}>
      {o.recommended && (
        <div>
          <Badge className="bg-accent text-accent-text">Подходит вам</Badge>
        </div>
      )}
      <p className="text-xl font-semibold">{o.title}</p>
      {o.description && <p>{o.description}</p>}
      <p className="text-hint">
        🗓 {formatWhen(o.starts_at)}
        <br />
        📍 {o.format === "online" ? FORMAT.online : `${REGION[o.region]}${o.place ? ", " + o.place : ""}`}
        <br />
        👥 {left > 0 ? `Мест осталось: ${left} из ${o.slots}` : "Все места заняты"} · ⏱ {formatHours(o.hours)} ч
      </p>

      {o.my_status && !props.invite && <p className="font-semibold">{MY_STATUS[o.my_status]}</p>}
      {error && <ErrorBox text={error} />}

      {props.invite && (
        <div className="flex flex-col gap-2">
          <Button wide loading={busy === "confirm"} disabled={!!busy} onClick={() => act("confirm")}>
            Подтвердить участие
          </Button>
          <Button wide variant="ghost" loading={busy === "decline"} disabled={!!busy} onClick={() => act("decline")}>
            Не смогу
          </Button>
        </div>
      )}
      {!props.invite && volunteerId && !o.my_status && left > 0 && (
        <Button wide loading={busy === "respond"} onClick={() => act("respond")}>
          Откликнуться
        </Button>
      )}
    </Card>
  );
}
