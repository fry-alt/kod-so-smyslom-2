// Тест по модулю: вопросы по одному, крупные варианты, потом результат с разбором.
import { useEffect, useState } from "react";

import type { Quiz, QuizResult, TrainingModule } from "../../../api";
import { backend } from "../../../backend";
import { Icon } from "../../../icons";
import { Button, Card, ErrorBox, errorText, StatusBadge } from "../../../ui";

const PASS_SCORE = 70;

export default function QuizView(props: {
  module: TrainingModule;
  volunteerId: number;
  /** результат пришёл с сервера — запомнить отметку и статус */
  onResult: (result: QuizResult) => void;
  onBack: () => void;
}) {
  const [attempt, setAttempt] = useState(0); // +1 — загрузить тест заново
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    let cancelled = false; // ушли с экрана или нажали «ещё раз» — старый ответ не нужен
    setQuiz(null);
    setLoadError("");
    setResult(null);
    setStep(0);
    backend
      .quiz(props.module.id)
      .then((q) => {
        if (cancelled) return;
        if (!q.questions.length) throw new Error("Для этого модуля пока нет вопросов.");
        setQuiz(q);
        setAnswers(q.questions.map(() => null));
      })
      .catch((e: unknown) => !cancelled && setLoadError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [props.module.id, attempt]);

  async function send(final: (number | null)[]) {
    setSending(true);
    setSendError("");
    try {
      const r = await backend.submitQuiz({
        volunteer_id: props.volunteerId,
        module_id: props.module.id,
        answers: final.map((a) => a ?? -1),
      });
      setResult(r);
      props.onResult(r);
      window.scrollTo(0, 0);
    } catch (e) {
      setSendError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  const header = (
    <div>
      <button type="button" onClick={props.onBack} className="min-h-12 text-link">
        ← К модулям
      </button>
      <h1 className="text-3xl font-bold">Тест</h1>
      <p className="text-hint">{props.module.title}</p>
    </div>
  );

  if (loadError) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorBox text={loadError} onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Waiting />
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ResultView quiz={quiz} answers={answers} result={result} />
        {!result.passed && (
          <Button wide onClick={() => setAttempt((a) => a + 1)}>
            Пройти тест ещё раз
          </Button>
        )}
        <Button wide variant={result.passed ? "primary" : "secondary"} onClick={props.onBack}>
          Вернуться к модулям
        </Button>
      </div>
    );
  }

  const q = quiz.questions[step];
  const chosen = answers[step];
  const isLast = step === quiz.questions.length - 1;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <p className="font-semibold text-hint">
        Вопрос {step + 1} из {quiz.questions.length}
      </p>
      <Card className="flex flex-col gap-4">
        <p id={`quiz-q-${step}`} className="text-xl font-semibold">
          {q.question}
        </p>
        {/* настоящие radio: стрелки переключают ответ, группа названа текстом вопроса */}
        <div className="flex flex-col gap-3" role="radiogroup" aria-labelledby={`quiz-q-${step}`}>
          {q.options.map((option, i) => {
            const on = chosen === i;
            return (
              <label
                key={i}
                className={`relative min-h-14 cursor-pointer rounded-2xl border-2 px-4 py-3 text-left text-lg transition select-none has-disabled:cursor-default ${
                  on ? "border-accent bg-accent text-accent-text" : "border-line bg-page"
                }`}
              >
                <input
                  type="radio"
                  name={`quiz-${attempt}-${step}`}
                  checked={on}
                  disabled={sending}
                  onChange={() => setAnswers((a) => a.map((x, j) => (j === step ? i : x)))}
                  className="sr-only"
                />
                <span aria-hidden="true">{on ? "● " : "○ "}</span>
                {option}
              </label>
            );
          })}
        </div>
      </Card>
      {sendError && <ErrorBox text={sendError} onRetry={() => send(answers)} />}
      <Button
        wide
        disabled={chosen === null}
        loading={sending}
        onClick={() => {
          if (isLast) return send(answers);
          setStep(step + 1);
          window.scrollTo(0, 0);
        }}
      >
        {isLast ? "Отправить ответы" : "Далее"}
      </Button>
      {chosen === null && <p className="-mt-3 text-center text-hint">Выберите один вариант ответа</p>}
      {step > 0 && (
        <Button variant="ghost" disabled={sending} onClick={() => setStep(step - 1)}>
          ← Предыдущий вопрос
        </Button>
      )}
    </div>
  );
}

/** Вопросы сочиняет нейросеть — это может занять 5–10 секунд. Показываем, что всё идёт. */
function Waiting() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="size-12 animate-spin rounded-full border-4 border-line border-t-accent" aria-hidden />
      <p className="text-xl font-semibold" role="status">
        Готовим вопросы…
      </p>
      <p className="text-hint">
        {seconds < 15
          ? "Обычно это занимает до 10 секунд. Пожалуйста, подождите."
          : "Получается дольше обычного. Ещё немного…"}
      </p>
    </Card>
  );
}

function ResultView(props: { quiz: Quiz; answers: (number | null)[]; result: QuizResult }) {
  const { result } = props;
  const right = result.correct.filter(Boolean).length;
  return (
    <>
      <div
        className={`flex flex-col gap-2 rounded-3xl p-5 ${
          result.passed ? "bg-green-50 text-green-950" : "bg-amber-50 text-amber-950"
        }`}
      >
        <p className="text-4xl font-bold">{result.score}%</p>
        <p className="text-lg">
          Правильных ответов: <b>{right}</b> из {result.correct.length}
        </p>
        <p className="text-lg font-semibold">
          {result.passed ? (
            <>
              <Icon name="check" className="mr-1.5 size-[1.15em] align-[-0.2em]" />
              Тест пройден!
            </>
          ) : (
            `Пока не получилось: нужно не меньше ${PASS_SCORE}%. Перечитайте модуль и попробуйте ещё раз.`
          )}
        </p>
        <div className="pt-1">
          <span>Ваш статус: </span>
          <StatusBadge status={result.status} />
        </div>
      </div>

      <h2 className="text-2xl font-bold">Ваши ответы</h2>
      <ol className="flex flex-col gap-3">
        {props.quiz.questions.map((q, i) => {
          const ok = result.correct[i];
          const a = props.answers[i];
          return (
            <li
              key={i}
              className={`flex flex-col gap-1 rounded-2xl border-2 p-4 ${
                ok ? "border-green-600 bg-green-50 text-green-950" : "border-red-600 bg-red-50 text-red-950"
              }`}
            >
              <p className="font-semibold">
                {i + 1}. {q.question}
              </p>
              <p>Ваш ответ: {a !== null && a >= 0 ? q.options[a] : "—"}</p>
              <p className={`font-semibold ${ok ? "text-green-800" : "text-red-800"}`}>
                <span aria-hidden="true">{ok ? "✓ " : "✗ "}</span>
                {ok ? "Верно" : "Неверно"}
              </p>
              {!ok && (
                <p className="font-medium text-green-900">
                  Правильный ответ: {q.options[result.correct_answers[i]]}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
