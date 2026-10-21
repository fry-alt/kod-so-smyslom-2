// Сообщения в кабинете фонда (T-100): слева — все переписки с волонтёрами (новые сверху),
// справа — открытая переписка. Написать новому — кнопка «Написать» в карточке волонтёра,
// у участника занятия или у отклика в «Сводке» (тогда сообщение — «о занятии …», ?about=<id>).
import { useEffect } from "react";

import type { DialogSummary } from "../../api";
import { backend } from "../../backend";
import Thread, { UnreadBadge } from "../../messages/Thread";
import { useSearchParam } from "../../router";
import { Card, Empty, ErrorBox, Link, Loading, useLoad } from "../../ui";

export default function Messages(props: { volunteerId?: number }) {
  const { data, error, loading, reload } = useLoad(() => backend.dialogs(), []);
  // список обновляем раз в 10 секунд — видно, кто ответил
  useEffect(() => {
    const timer = setInterval(() => !document.hidden && reload(), 10000);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Сообщения</h1>
      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className={`flex flex-col gap-1 p-2 ${props.volunteerId ? "max-lg:hidden" : ""}`}>
          {loading && !data && <Loading />}
          {error && !data && <ErrorBox text={error} onRetry={reload} />}
          {data?.length === 0 && (
            <Empty>Переписок пока нет. Откройте карточку волонтёра или участника занятия и нажмите «Написать».</Empty>
          )}
          {data?.map((d) => <DialogRow key={d.volunteer.id} d={d} active={d.volunteer.id === props.volunteerId} />)}
        </Card>
        {props.volunteerId ? (
          <Open volunteerId={props.volunteerId} onChange={reload} />
        ) : (
          <Card className="max-lg:hidden">
            <Empty>Выберите переписку слева.</Empty>
          </Card>
        )}
      </div>
    </div>
  );
}

function DialogRow(props: { d: DialogSummary; active: boolean }) {
  const { d } = props;
  const last = d.last ? (d.last.sender === "coordinator" ? "Вы: " : "") + d.last.text : "";
  return (
    <Link
      to={`/admin/messages/${d.volunteer.id}`}
      className={`flex flex-col gap-0.5 rounded-2xl px-3 py-2.5 transition ${props.active ? "bg-soft" : "hover:bg-page"}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={`truncate ${d.unread > 0 ? "font-bold" : "font-semibold"}`}>{d.volunteer.name}</span>
        <UnreadBadge count={d.unread} />
      </span>
      <span className={`truncate text-sm ${d.unread > 0 ? "text-ink" : "text-hint"}`}>{last}</span>
    </Link>
  );
}

function Open(props: { volunteerId: number; onChange: () => void }) {
  const aboutId = Number(useSearchParam("about"));
  const { data } = useLoad(
    () => Promise.all([backend.get(props.volunteerId), aboutId > 0 ? backend.opportunities() : Promise.resolve([])]),
    [props.volunteerId, aboutId],
  );
  const [v, list] = data ?? [null, []];
  const about = list.find((o) => o.id === aboutId);

  return (
    <Card className="flex flex-col gap-3">
      <Link to="/admin/messages" className="text-link lg:hidden">
        ← Все сообщения
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-semibold">{v?.name ?? "…"}</h2>
        <Link to={`/admin/volunteers/${props.volunteerId}`}>Карточка волонтёра →</Link>
      </div>
      <Thread
        volunteerId={props.volunteerId}
        reader="coordinator"
        about={about ? { id: about.id, title: about.title } : null}
        onChange={props.onChange}
      />
    </Card>
  );
}
