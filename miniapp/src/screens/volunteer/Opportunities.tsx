// Куда можно пойти: приглашения координатора сверху, ниже — лента возможностей с откликом.
import { type ReactNode, useState } from "react";

import type { Opportunity, Participation, ParticipationStatus } from "../../api";
import { backend, getVolunteerId } from "../../backend";
import { FORMAT, REGION } from "../../labels";
import { Icon } from "../../icons";
import { navigate } from "../../router";
import { Button, Empty, ErrorBox, errorText, formatHours, formatWhen, Loading, useLoad } from "../../ui";

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
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Куда можно пойти</h1>

      {!id && (
        <section className="flex flex-col gap-4 rounded-3xl bg-soft p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <p className="max-w-[44ch] text-lg">
            Чтобы откликнуться и получать приглашения, сначала заполните анкету — это 5 минут.
          </p>
          <div className="shrink-0">
            <Button onClick={() => navigate("/form")}>Заполнить анкету</Button>
          </div>
        </section>
      )}

      {notice && (
        <p role="status" className="rounded-2xl bg-green-100 px-4 py-3 text-lg text-green-900">
          {notice}
        </p>
      )}
      {loading && !data && <Loading />}
      {error && <ErrorBox text={error} onRetry={reload} />}

      {data && invites.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-semibold">Вас приглашают</h2>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {invites.map((o) => (
              <OpportunityItem
                key={o.id}
                o={o}
                participation={mine.find((p) => p.opportunity_id === o.id)}
                onDone={done}
                invite
                nested
              />
            ))}
          </div>
        </section>
      )}

      {data && (
        <section className="flex flex-col gap-4">
          {invites.length > 0 && <h2 className="font-display text-2xl font-semibold">Все возможности</h2>}
          {feed.length === 0 ? (
            <Empty>Пока нет открытых возможностей. Загляните позже — координатор добавит новые.</Empty>
          ) : (
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {feed.map((o) => (
                <OpportunityItem
                  key={o.id}
                  o={o}
                  participation={mine.find((p) => p.opportunity_id === o.id)}
                  onDone={done}
                  nested={invites.length > 0}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {id && (
        <div className="self-start">
          <Button variant="secondary" onClick={() => navigate("/me")}>
            Мои часы и история
          </Button>
        </div>
      )}
    </div>
  );
}

function OpportunityItem(props: {
  o: Opportunity;
  participation?: Participation;
  onDone: (notice: string) => void;
  invite?: boolean;
  /** карточка внутри раздела с заголовком h2 («Вас приглашают», «Все возможности») — тогда её заголовок h3 */
  nested?: boolean;
}) {
  const { o, participation } = props;
  const Title = props.nested ? "h3" : "h2";
  const volunteerId = getVolunteerId();
  const left = Math.max(0, o.slots - o.taken);
  const [busy, setBusy] = useState<"" | "respond" | "confirm" | "decline" | "cancel">("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");

  async function act(kind: "respond" | "confirm" | "decline" | "cancel") {
    if (!volunteerId) return;
    setBusy(kind);
    setError("");
    try {
      if (kind === "respond") await backend.respond(o.id, volunteerId);
      else if (kind === "decline" || kind === "cancel") await backend.cancelResponse(o.id, volunteerId);
      else if (!participation) throw new Error("Не нашли ваше приглашение. Обновите страницу.");
      else await backend.updateParticipation(participation.id, "confirmed");
      props.onDone(
        {
          respond: `Вы откликнулись на «${o.title}». Координатор свяжется с вами.`,
          confirm: `✓ Вы записаны: «${o.title}», ${formatWhen(o.starts_at)}. Ждём вас!`,
          decline: `Вы отказались от «${o.title}». Спасибо, что предупредили.`,
          cancel: `Запись на «${o.title}» отменена. Спасибо, что предупредили. Если передумаете — откликнитесь снова.`,
        }[kind],
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  const d = new Date(o.starts_at);
  // после отмены (declined) карточка снова как новая — можно откликнуться ещё раз
  const myStatus = o.my_status === "declined" ? null : o.my_status;
  const status = myStatus && !props.invite ? MY_STATUS[myStatus] : "";
  const canRespond = !props.invite && volunteerId && !myStatus && left > 0;
  // отклик или запись ещё до занятия — можно отменить
  const canCancel = !props.invite && volunteerId && (myStatus === "responded" || myStatus === "confirmed");
  // откликнулся, приглашён или записан — можно задать вопрос координатору об этом занятии
  const canWrite = volunteerId && o.my_status && o.my_status !== "declined";

  return (
    <article
      className={`flex h-full min-w-0 flex-col gap-4 rounded-3xl border-2 bg-page p-4 sm:p-5 ${props.invite ? "border-accent" : "border-line"}`}
    >
      <div className="flex min-w-0 gap-3 sm:gap-4">
        <span className="flex w-14 shrink-0 flex-col items-center self-start sm:w-16 rounded-2xl bg-soft py-2">
          <span className="font-display text-2xl leading-none font-semibold">{d.getDate()}</span>
          <span className="text-sm">{d.toLocaleDateString("ru", { month: "short" }).replace(".", "")}</span>
          <span className="text-sm text-hint">{d.toLocaleDateString("ru", { weekday: "short" })}</span>
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <Title className="break-words text-xl leading-snug font-semibold">{o.title}</Title>
          <p className="[overflow-wrap:anywhere] text-hint">
            {d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })},{" "}
            {o.format === "online" ? FORMAT.online.toLowerCase() : o.place || REGION[o.region]}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {left > 0 ? (
              <Chip className="bg-pop">
                {left === 1 ? "Нужен ещё 1 человек" : `Нужно ещё ${left} человек${left < 5 ? "а" : ""}`}
              </Chip>
            ) : (
              <Chip className="bg-soft">Все места заняты</Chip>
            )}
            <Chip className="bg-soft">
              <Icon name="clock" className="mr-1 size-[1.1em] align-[-0.18em]" />
              {formatHours(o.hours)} ч
            </Chip>
            {o.recommended && <Chip className="bg-accent text-accent-text">Подходит вам</Chip>}
          </div>
        </div>
      </div>

      {o.description && <p className="leading-relaxed">{o.description}</p>}

      {(status || error || props.invite || canRespond || canCancel) && (
        <div className="mt-auto flex flex-col gap-2">
          {status && <p className="rounded-2xl bg-soft px-4 py-3 font-semibold">{status}</p>}
          {error && <ErrorBox text={error} />}
          {props.invite && (
            <>
              <Button wide loading={busy === "confirm"} disabled={!!busy} onClick={() => act("confirm")}>
                Подтвердить участие
              </Button>
              <Button wide variant="ghost" loading={busy === "decline"} disabled={!!busy} onClick={() => act("decline")}>
                Не смогу
              </Button>
            </>
          )}
          {canRespond && (
            <Button wide loading={busy === "respond"} onClick={() => act("respond")}>
              Откликнуться
            </Button>
          )}
          {canWrite && (
            <Button wide variant="secondary" onClick={() => navigate(`/messages?about=${o.id}`)}>
              Написать координатору
            </Button>
          )}
          {canCancel &&
            (!confirmCancel ? (
              <Button wide variant="ghost" onClick={() => setConfirmCancel(true)}>
                Отменить запись
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-2xl bg-soft p-3">
                <p className="text-center text-lg font-semibold">Точно отменить запись?</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button wide loading={busy === "cancel"} loadingLabel="Отменяем…" disabled={!!busy} onClick={() => act("cancel")}>
                    Да, отменить
                  </Button>
                  <Button wide variant="secondary" disabled={!!busy} onClick={() => setConfirmCancel(false)}>
                    Нет, остаюсь
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}
    </article>
  );
}

function Chip(props: { children: ReactNode; className: string }) {
  return <span className={`max-w-full rounded-full px-3 py-0.5 text-sm font-semibold [overflow-wrap:anywhere] ${props.className}`}>{props.children}</span>;
}
