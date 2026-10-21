// Боковая панель координатора в звонке (T-69): «План» — вопросы от AI, «Итог» — оценки и решение.
// После звонка — не панель, а широкая колонка по центру страницы: итог крупно, вопросы — свёрнутым блоком сверху.
// Открывается по ссылке из кабинета: /call/<token>?as=coordinator&interview=<id>&volunteer=<id>.
// Имя волонтёра здесь не показываем — как и на всей странице звонка.
import { useEffect, useState } from "react";

import type { Interview, Role } from "../api";
import { backend } from "../backend";
import Plan from "../screens/admin/interview/Plan";
import ResultForm, { ResultSummary } from "../screens/admin/interview/ResultForm";
import { LinkButton } from "../screens/admin/parts";
import { Button, Loading, useLoad } from "../ui";

type Tab = "plan" | "result";

export default function CoordinatorPanel(props: { interviewId: number; volunteerId: number; ended: boolean }) {
  const [tab, setTab] = useState<Tab>("plan");
  // звонок завершён — сразу открываем итог, пока всё свежо в памяти
  useEffect(() => {
    if (props.ended) setTab("result");
  }, [props.ended]);

  if (props.ended)
    return (
      <div className="flex flex-col gap-6">
        <details className="group rounded-[2rem] bg-surface">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-[2rem] px-5 py-3 text-lg font-semibold md:px-8 [&::-webkit-details-marker]:hidden">
            Вопросы собеседования
            <span aria-hidden className="text-hint transition group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="px-5 pb-5 md:px-8 md:pb-8">
            <Plan volunteerId={props.volunteerId} />
          </div>
        </details>
        <section aria-labelledby="result-title" className="flex flex-col gap-5 rounded-[2rem] bg-surface p-5 md:p-8">
          <h2 id="result-title" className="font-display text-2xl leading-tight font-semibold md:text-3xl">
            Итог собеседования
          </h2>
          <Result interviewId={props.interviewId} volunteerId={props.volunteerId} ended />
        </section>
      </div>
    );

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

/** ended — звонок завершён: после сохранения можно уйти в карточку волонтёра или в кабинет (во время звонка — нельзя). */
function Result(props: { interviewId: number; volunteerId: number; ended?: boolean }) {
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
        <div className="flex flex-wrap gap-2">
          {props.ended && <LinkButton to={`/admin/volunteers/${props.volunteerId}`}>Открыть карточку волонтёра</LinkButton>}
          {props.ended && (
            <LinkButton to="/admin" variant="secondary">
              В кабинет фонда
            </LinkButton>
          )}
          <Button variant={props.ended ? "ghost" : "secondary"} onClick={() => setEditing(true)}>
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
