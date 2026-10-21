// Итог собеседования (T-69): три оценки 1–5, решение, подходящие роли и комментарий.
// Итог видит только фонд: волонтёру он не показывается и в AI не отправляется.
// Статус волонтёра итог не меняет — его по-прежнему ставит координатор.
import { useRef, useState, type FormEvent } from "react";

import type { Decision, Interview, InterviewResult, Role } from "../../../api";
import { backend } from "../../../backend";
import { DECISION } from "../../../labels";
import { Badge, Button, Chips, ErrorBox, errorText, Field, inputClass } from "../../../ui";

type Score = "motivation" | "readiness" | "regularity";

const SCORES: { key: Score; label: string; hint: string }[] = [
  { key: "motivation", label: "Мотивация", hint: "Понимает, зачем идёт к нам" },
  { key: "readiness", label: "Готовность к работе с подопечными", hint: "Спокойно говорит об особых ребятах" },
  { key: "regularity", label: "Регулярность", hint: "Насколько надёжно будет приходить" },
];

export default function ResultForm(props: {
  interviewId: number;
  initial: InterviewResult | null;
  roles: Role[];
  /** роли, которые предложил AI по анкете, — отмечены заранее, если итога ещё нет */
  suggestedRoles?: string[];
  onSaved: (i: Interview) => void;
  onCancel?: () => void;
}) {
  const init = props.initial;
  const [scores, setScores] = useState<Record<Score, number>>({
    motivation: init?.motivation ?? 0,
    readiness: init?.readiness ?? 0,
    regularity: init?.regularity ?? 0,
  });
  const [decision, setDecision] = useState<Decision | null>(init?.decision ?? null);
  const known = new Set(props.roles.map((r) => r.code));
  const [roles, setRoles] = useState<string[]>(
    init?.roles ?? (props.suggestedRoles ?? []).filter((c) => known.has(c)),
  );
  const [comment, setComment] = useState(init?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const missing = SCORES.some((s) => scores[s.key] === 0) || !decision;
  const roleOptions = Object.fromEntries(props.roles.map((r) => [r.code, r.title])) as Record<string, string>;

  async function save(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (missing || !decision) {
      // показать первую незаполненную оценку — она может быть выше экрана
      requestAnimationFrame(() => form.current?.querySelector("[data-error]")?.scrollIntoView({ block: "center" }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      props.onSaved(
        await backend.saveInterviewResult(props.interviewId, { ...scores, decision, roles, comment: comment.trim() }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={form} onSubmit={save} className="flex flex-col gap-5">
      {SCORES.map((s) => (
        <Field key={s.key} label={s.label} hint={s.hint} group error={tried && scores[s.key] === 0 ? "Поставьте оценку" : undefined}>
          <Rating label={s.label} value={scores[s.key]} onChange={(n) => setScores({ ...scores, [s.key]: n })} />
        </Field>
      ))}

      <Field label="Решение" group error={tried && !decision ? "Выберите решение" : undefined}>
        <Chips<Decision> options={DECISION} value={decision ? [decision] : []} onChange={(v) => setDecision(v[0])} />
      </Field>

      {props.roles.length > 0 && (
        <Field
          label="Подходящие роли"
          hint={!init && roles.length > 0 ? "Отмечены роли, которые предложил AI по анкете — поправьте, если нужно." : undefined}
          group
        >
          <Chips<string> options={roleOptions} value={roles} onChange={setRoles} multiple />
        </Field>
      )}

      <Field label="Комментарий" hint="Видят только сотрудники фонда.">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Например: сама ведёт керамику, готова к постоянной группе"
          className={inputClass}
        />
      </Field>

      {error && <ErrorBox text={`Итог не сохранился: ${error}`} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          Сохранить итог
        </Button>
        {props.onCancel && (
          <Button variant="ghost" onClick={props.onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  );
}

/** Оценка 1–5 крупными круглыми кнопками. */
function Rating(props: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={props.label}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = props.value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${n} из 5`}
            onClick={() => props.onChange(n)}
            className={`size-12 rounded-full border-2 font-display text-lg font-semibold transition ${
              on ? "border-accent bg-accent text-accent-text" : n <= props.value ? "border-accent bg-soft" : "border-line bg-page hover:border-accent"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/** Сохранённый итог — коротко, для списка собеседований. */
export function ResultSummary(props: { result: InterviewResult; roles: Role[] }) {
  const r = props.result;
  const title = (code: string) => props.roles.find((x) => x.code === code)?.title ?? code;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={DECISION_COLOR[r.decision]}>{DECISION[r.decision]}</Badge>
        {SCORES.map((s) => (
          <span key={s.key} className="rounded-full bg-surface px-3 py-1 text-sm">
            {s.label.split(" ")[0]} <b>{r[s.key]}</b>/5
          </span>
        ))}
      </div>
      {r.roles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.roles.map((c) => (
            <Badge key={c} className="bg-green-100 text-green-900">
              {title(c)}
            </Badge>
          ))}
        </div>
      )}
      {r.comment && <p className="break-words whitespace-pre-line">{r.comment}</p>}
    </div>
  );
}

const DECISION_COLOR: Record<Decision, string> = {
  next: "bg-emerald-200 text-emerald-950",
  think: "bg-amber-100 text-amber-900",
  reject: "bg-gray-200 text-gray-700",
};
