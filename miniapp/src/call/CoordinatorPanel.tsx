// Боковая панель координатора в звонке (T-69): «План» — вопросы от AI, «Итог» — оценки и решение.
// Открывается по ссылке из кабинета: /call/<token>?as=coordinator&interview=<id>&volunteer=<id>.
// Имя волонтёра здесь не показываем — как и на всей странице звонка.
import { useEffect, useState } from "react";

import type { Interview, Role } from "../api";
import { backend } from "../backend";
import Plan from "../screens/admin/interview/Plan";
import ResultForm, { ResultSummary } from "../screens/admin/interview/ResultForm";
import { Button, Loading, useLoad } from "../ui";

type Tab = "plan" | "result";

export default function CoordinatorPanel(props: { interviewId: number; volunteerId: number; ended: boolean }) {
  const [tab, setTab] = useState<Tab>("plan");
  // звонок завершён — сразу открываем итог, пока всё свежо в памяти
  useEffect(() => {
    if (props.ended) setTab("result");
  }, [props.ended]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-full bg-page p-1" role="tablist" aria-label="Панель координатора">
        {(["plan", "result"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-full px-4 font-semibold transition ${
              tab === t ? "bg-accent text-accent-text" : "text-hint hover:text-ink"
            }`}
          >
            {t === "plan" ? "План" : "Итог"}
          </button>
        ))}
      </div>
      {/* план не выгружаем при переключении вкладок — вопросы не должны пропадать и грузиться заново */}
      <div hidden={tab !== "plan"}>
        <Plan volunteerId={props.volunteerId} />
      </div>
      {tab === "result" && <Result interviewId={props.interviewId} volunteerId={props.volunteerId} />}
    </div>
  );
}

function Result(props: { interviewId: number; volunteerId: number }) {
  const { data, loading } = useLoad(
    () =>
      Promise.all([
        backend.interviews(props.volunteerId),
        backend.roles().catch((): Role[] => []),
        backend.get(props.volunteerId).catch(() => null), // только роли из профиля — имя не показываем
      ]),
    [props.volunteerId],
  );
  const [saved, setSaved] = useState<Interview | null>(null);
  const [editing, setEditing] = useState(false);

  if (loading && !data) return <Loading />;
  const [list, roles, volunteer] = data ?? [[], [], null];
  const interview = saved ?? list.find((i) => i.id === props.interviewId) ?? null;
  const result = interview?.result ?? null;

  if (result && !editing)
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="font-semibold text-accent">
          ✓ Итог сохранён — он виден в карточке волонтёра
        </p>
        <ResultSummary result={result} roles={roles} />
        <div>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Изменить
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-hint">Оценки и комментарий видят только сотрудники фонда. Волонтёру итог не показывается.</p>
      <ResultForm
        interviewId={props.interviewId}
        initial={result}
        roles={roles}
        suggestedRoles={volunteer?.profile?.suitable_roles}
        onSaved={(i) => {
          setSaved(i);
          setEditing(false);
        }}
        onCancel={editing ? () => setEditing(false) : undefined}
      />
    </div>
  );
}
