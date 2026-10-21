// План собеседования от AI (T-69): вопросы под анкету с пояснением «зачем» и «на что обратить внимание».
// План сохраняется на сервере и не меняется сам — «Обновить» строит его заново.
// Только для координатора: в карточке волонтёра и (позже) рядом со звонком.
import { useState } from "react";

import type { InterviewPlan } from "../../../api";
import { backend } from "../../../backend";
import { Badge, Button, ErrorBox, errorText, Loading, useLoad } from "../../../ui";

export default function Plan(props: { volunteerId: number }) {
  const { data, error, loading, reload } = useLoad(() => backend.interviewPlan(props.volunteerId), [props.volunteerId]);
  const [fresh, setFresh] = useState<InterviewPlan | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const plan = fresh?.volunteer_id === props.volunteerId ? fresh : data;

  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    try {
      setFresh(await backend.interviewPlan(props.volunteerId, true));
    } catch (e) {
      setRefreshError(errorText(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          План собеседования
          {plan && !plan.ai && (
            <Badge className="bg-page text-hint" title="AI сейчас недоступен — базовые вопросы по правилам фонда">
              без AI
            </Badge>
          )}
        </h3>
        {plan && (
          <Button variant="secondary" onClick={refresh} loading={refreshing}>
            ↻ Обновить
          </Button>
        )}
      </div>

      {loading && !plan && <Loading text="AI готовит вопросы по анкете…" />}
      {error && !plan && <ErrorBox text={`План не загрузился: ${error}`} onRetry={reload} />}
      {refreshError && <ErrorBox text={`Не удалось обновить план: ${refreshError}`} />}

      {plan && (
        <>
          {plan.focus.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-pop bg-page p-4">
              <span className="font-semibold">👀 На что обратить внимание</span>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {plan.focus.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <ol className="flex flex-col gap-2">
            {plan.questions.map((q, i) => (
              <li key={q.question} className="flex gap-3 rounded-2xl bg-page px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-soft font-display text-sm font-semibold">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{q.question}</span>
                  {q.why && <span className="text-sm text-hint">Зачем: {q.why}</span>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
