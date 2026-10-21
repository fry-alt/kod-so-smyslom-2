// «Сообщения» в личном кабинете волонтёра (T-100): переписка с координатором фонда.
// С карточки занятия приходят с ?about=<id> — первое сообщение будет «о занятии …».
import { backend, getVolunteerId } from "../../backend";
import Thread from "../../messages/Thread";
import { navigate, useSearchParam } from "../../router";
import { Button, Link, useLoad } from "../../ui";

export default function Messages() {
  const id = getVolunteerId();
  const aboutId = Number(useSearchParam("about"));
  const { data: about } = useLoad(
    async () => (aboutId > 0 ? (await backend.opportunities()).find((o) => o.id === aboutId) ?? null : null),
    [aboutId],
  );

  return (
    <div className="flex flex-col gap-4">
      <Link to="/me">← В личный кабинет</Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Сообщения</h1>
        <p className="text-hint">Переписка с координатором фонда «Дети Марии»</p>
      </div>
      {id ? (
        <Thread volunteerId={id} reader="volunteer" about={about ? { id: about.id, title: about.title } : null} />
      ) : (
        <section className="flex flex-col items-start gap-4 rounded-3xl bg-soft p-5">
          <p className="text-lg">Чтобы написать координатору, сначала заполните анкету — это 5 минут.</p>
          <Button onClick={() => navigate("/form")}>Заполнить анкету</Button>
        </section>
      )}
    </div>
  );
}
