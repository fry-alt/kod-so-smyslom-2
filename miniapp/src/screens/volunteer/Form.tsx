// Анкета волонтёра (T-07): сайт и Telegram Mini App.
// Пошагово: один экран — одна тема, в конце «Проверьте ответы». Так не страшно начать и легко закончить.
// Имя и контакт хранятся только в нашей базе. Ответы о себе — обезличенно — разбирает AI.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { Answers, Availability, Format, Occupation, Region, Regularity, Role, Volunteer } from "../../api";
import { backend, getAccount, saveAccount, setVolunteerId } from "../../backend";
import { AVAILABILITY, FORMAT, OCCUPATION, REGION, REGULARITY } from "../../labels";
import { FUND_DOCS } from "../../Footer";
import { navigate } from "../../router";
import { tg, tgUser } from "../../telegram";
import { Badge, Button, Card, ErrorBox, errorText, FLAIR, flairHandlers, inputClass } from "../../ui";

type Draft = { name: string; contact: string; consent: boolean; step: number; answers: Answers };

const DRAFT_KEY = "form_draft";

/** Шаги анкеты по порядку. fields — какие ошибки проверяем перед переходом дальше. */
const STEPS = [
  { title: "Давайте знакомиться", short: "Знакомство", icon: "👋", fields: ["name", "contact"] },
  { title: "Немного о жизни", short: "О жизни", icon: "🏡", fields: [] },
  { title: "Расскажите о себе", short: "О себе", icon: "✍️", fields: ["about"] },
  { title: "Чем хочется помогать", short: "Желания", icon: "🧡", fields: [] },
  { title: "Когда и как удобно", short: "Время", icon: "🗓️", fields: ["availability", "formats"] },
  { title: "Проверьте анкету", short: "Проверка", icon: "✅", fields: ["consent"] },
] as const;

const LAST = STEPS.length - 1;

const OCCUPATION_ICON: Record<Occupation, string> = {
  student: "🎓",
  pensioner: "🌿",
  remote: "💻",
  employed: "🏢",
  schoolkid: "🎒",
  other: "✨",
};

const AVAILABILITY_ICON: Record<Availability, string> = {
  weekday_morning: "🌅",
  weekday_day: "☀️",
  weekday_evening: "🌙",
  weekend: "🎨",
};

/** Подсказка под вариантом — то, что фонду важно сказать сразу. */
const AVAILABILITY_SUB: Partial<Record<Availability, string>> = {
  weekday_morning: "Очень нужно",
  weekday_day: "Очень нужно",
  weekend: "Мастерские по субботам",
};

const FORMAT_ICON: Record<Format, string> = { offline: "🤝", online: "💬" };
const FORMAT_SUB: Record<Format, string> = {
  offline: "Приезжать на занятия и события",
  online: "Помогать из дома: тексты, дизайн, переводы",
};

const REGULARITY_ICON: Record<Regularity, string> = { regular: "🔁", episodic: "📌", any: "🤷" };
const REGULARITY_SUB: Record<Regularity, string> = {
  regular: "По графику, раз в неделю или чаще",
  episodic: "На отдельные события и ярмарки",
  any: "Как позволит время",
};

/** Готовые слова для полей «Что вы умеете» и «Чем хотели бы помогать» — по ролям фонда (data/roles.json). */
const SKILL_IDEAS = [
  "Рисование",
  "Шитьё и рукоделие",
  "Керамика",
  "Кулинария",
  "Фотография",
  "Видеомонтаж",
  "Соцсети и тексты",
  "Дизайн",
  "Английский язык",
  "Работа с детьми",
  "Педагогика",
  "Психология",
  "Вожу машину",
];

const WISH_IDEAS = [
  "Помогать на занятиях в мастерской",
  "Сопровождать ребят из интерната",
  "Снимать фото и видео",
  "Помогать на ярмарках",
  "Подвозить на своей машине",
  "Помогать онлайн из дома",
];

function emptyDraft(): Draft {
  const tgName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ");
  return {
    name: tgName,
    // контакт подставляем сам: ник из Telegram или почта, с которой человек зарегистрировался
    contact: tgUser?.username ? `@${tgUser.username}` : (getAccount()?.email ?? ""),
    consent: false,
    step: 0,
    answers: {
      about: "",
      skills: "",
      wishes: "",
      experience: "",
      availability: [],
      occupation: "other",
      region: "moscow",
      formats: ["offline"],
      regularity: "any",
    },
  };
}

/** Черновик и шаг сохраняются на устройстве — чтобы не потерять текст, если человек отвлёкся. */
function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (saved?.answers) {
      const draft = { ...emptyDraft(), ...saved, answers: { ...emptyDraft().answers, ...saved.answers } };
      return { ...draft, step: Math.min(Math.max(Number(draft.step) || 0, 0), LAST) };
    }
  } catch {
    /* нет черновика или он испорчен — начинаем с пустого */
  }
  return emptyDraft();
}

type Errors = Partial<Record<"name" | "contact" | "about" | "availability" | "formats" | "consent", string>>;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = "Напишите, как к вам обращаться";
  const c = d.contact.trim();
  if (!c) e.contact = "Оставьте телефон, e-mail или ник в Telegram — иначе мы не сможем связаться";
  else if (!/@|\d{5,}/.test(c.replace(/[\s()-]/g, ""))) e.contact = "Похоже на опечатку: нужен телефон, e-mail или @ник";
  if (!d.answers.about.trim()) e.about = "Расскажите о себе хотя бы пару слов";
  if (d.answers.availability.length === 0) e.availability = "Отметьте хотя бы один вариант";
  if (d.answers.formats.length === 0) e.formats = "Отметьте хотя бы один вариант";
  if (!d.consent) e.consent = "Без согласия мы не можем сохранить анкету";
  return e;
}

/** Ошибки только тех полей, что есть на шаге. */
function stepErrors(d: Draft, step: number): Errors {
  const all = validate(d);
  const e: Errors = {};
  for (const f of STEPS[step].fields) if (all[f]) e[f] = all[f];
  return e;
}

/** Первый шаг, на котором что-то не заполнено, — туда ведём перед отправкой. */
function firstBadStep(d: Draft): number {
  const i = STEPS.findIndex((_, n) => Object.keys(stepErrors(d, n)).length > 0);
  return i === -1 ? LAST : i;
}

const haptic = () => tg?.HapticFeedback?.impactOccurred("light");

export default function Form() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  // пришли со страницы проверки, чтобы что-то поправить, — кнопка ведёт обратно к проверке
  const [fromCheck, setFromCheck] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Volunteer | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);
  // что уже сохранено и какой шаг уже показан — чтобы не срабатывать на открытии страницы
  const savedJson = useRef(JSON.stringify(draft));
  const shownStep = useRef(draft.step);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const step = draft.step;

  useEffect(() => {
    const json = JSON.stringify(draft);
    if (json === savedJson.current) return;
    savedJson.current = json;
    try {
      localStorage.setItem(DRAFT_KEY, json);
    } catch {
      /* приватный режим — без черновика */
    }
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1400);
  }, [draft]);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  // новый шаг: наверх и фокус на заголовок (на компьютере — сразу в первое поле)
  useEffect(() => {
    if (step === shownStep.current) return;
    shownStep.current = step;
    window.scrollTo({ top: 0, behavior: "smooth" });
    const field = document.querySelector<HTMLElement>("[data-step] input:not([type=checkbox]), [data-step] textarea");
    if (field && window.matchMedia("(pointer: fine)").matches) field.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // человек начал исправлять — подсказка об ошибке больше не нужна
  const set = (patch: Partial<Draft>) => {
    setErrors({});
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setAnswers = (patch: Partial<Answers>) => {
    setErrors({});
    setDraft((d) => ({ ...d, answers: { ...d.answers, ...patch } }));
  };

  function goTo(next: number, opts: { fromCheck?: boolean } = {}) {
    setDirection(next > step ? "forward" : "back");
    setErrors({});
    setFromCheck(!!opts.fromCheck);
    set({ step: next });
  }

  function showErrors(found: Errors) {
    setErrors(found);
    // качнуть вопросы: снять класс и поставить снова, чтобы анимация повторилась
    const el = questionsRef.current;
    el?.classList.remove("shake");
    void el?.offsetWidth;
    el?.classList.add("shake");
    tg?.HapticFeedback?.impactOccurred("medium");
    setTimeout(() => document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function next(e: FormEvent) {
    e.preventDefault();
    if (step === LAST) return send();
    const found = stepErrors(draft, step);
    if (Object.keys(found).length) return showErrors(found);
    haptic();
    goTo(fromCheck ? LAST : step + 1);
  }

  async function send() {
    const bad = firstBadStep(draft);
    if (bad !== LAST) {
      goTo(bad, { fromCheck: true });
      setTimeout(() => showErrors(stepErrors(draft, bad)));
      return;
    }
    const found = stepErrors(draft, LAST);
    if (Object.keys(found).length) return showErrors(found);
    setSending(true);
    setError("");
    try {
      const a = draft.answers;
      const v = await backend.submit({
        name: draft.name.trim(),
        contact: draft.contact.trim(),
        telegram_id: tgUser?.id ?? null,
        answers: {
          ...a,
          about: a.about.trim(),
          skills: a.skills.trim(),
          wishes: a.wishes.trim(),
          experience: a.experience.trim(),
        },
      });
      setVolunteerId(v.id);
      // бэкенд уже привязал анкету к аккаунту — запоминаем и здесь, чтобы кабинет открылся сразу
      const account = getAccount();
      if (account?.role === "volunteer" && !account.volunteer_id) saveAccount({ ...account, volunteer_id: v.id });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* не страшно */
      }
      tg?.HapticFeedback?.impactOccurred("heavy");
      setResult(v);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  if (result) return <Thanks volunteer={result} />;

  const a = draft.answers;
  const firstName = draft.name.trim().split(" ")[0];

  const reached = fromCheck ? LAST : step;
  const jump = (n: number) => goTo(n, { fromCheck: fromCheck && n !== LAST });

  return (
    <form
      onSubmit={next}
      noValidate
      className="grid min-w-0 flex-1 gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-14"
    >
      <StepList step={step} reached={reached} saved={saved} onJump={jump} />

      <div className="flex min-w-0 flex-col gap-5">
        <div className="md:hidden">
          <Progress step={step} reached={reached} saved={saved} onJump={jump} />
        </div>

        <div
          key={step}
          data-step
          className={`flex flex-col gap-6 ${direction === "forward" ? "step-in-forward" : "step-in-back"}`}
        >
            <div className="flex min-w-0 items-start gap-4">
            <span
              className="step-icon grid size-14 shrink-0 place-items-center rounded-2xl bg-soft text-3xl"
              aria-hidden="true"
            >
              {STEPS[step].icon}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="step-heading min-w-0 [overflow-wrap:anywhere] font-display text-[1.6rem] leading-tight font-semibold tracking-tight text-balance md:text-[2rem]"
              >
                {step === 1 && firstName ? `${firstName}, немного о жизни` : STEPS[step].title}
              </h1>
              <p className="text-hint">{STEP_INTRO[step]}</p>
            </div>
          </div>

          <div ref={questionsRef} className="flex flex-col gap-6">
            {step === 0 && (
              <>
                <Question label="Как вас зовут" required error={errors.name}>
                  <input
                    className={inputClass}
                    value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    autoComplete="name"
                    enterKeyHint="next"
                    maxLength={100}
                    placeholder="Имя и фамилия"
                  />
                </Question>
                <Question
                  label="Как с вами связаться"
                  required
                  hint="Телефон, e-mail или ник в Telegram. Его увидит только координатор фонда."
                  error={errors.contact}
                >
                  <input
                    className={inputClass}
                    value={draft.contact}
                    onChange={(e) => set({ contact: e.target.value })}
                    enterKeyHint="next"
                    maxLength={200}
                    placeholder="+7 900 000-00-00 или @nickname"
                  />
                </Question>
              </>
            )}

            {step === 1 && (
              <>
                <Question label="Чем вы сейчас заняты" group>
                  <Choices<Occupation>
                    options={OCCUPATION}
                    icons={OCCUPATION_ICON}
                    value={[a.occupation]}
                    onChange={([v]) => setAnswers({ occupation: v })}
                  />
                </Question>
                <Question
                  label="Где вы живёте"
                  group
                  hint="Фонд работает в Москве, Подмосковье, Ярославской области и Северной Осетии"
                >
                  <Choices<Region> options={REGION} value={[a.region]} onChange={([v]) => setAnswers({ region: v })} />
                </Question>
              </>
            )}

            {step === 2 && (
              <>
                <Question label="Пара слов о вас" required error={errors.about}>
                  <TextBox
                    value={a.about}
                    onChange={(v) => setAnswers({ about: v })}
                    placeholder="Например: я на пенсии, 20 лет работала учителем рисования, люблю возиться с детьми"
                    meter
                  />
                </Question>
                <Question group labelId="q-skills" label="Что вы умеете" hint="Нажмите на подходящее или допишите своё">
                  <Ideas ideas={SKILL_IDEAS} value={a.skills} onChange={(v) => setAnswers({ skills: v })} />
                  <TextBox
                    value={a.skills}
                    onChange={(v) => setAnswers({ skills: v })}
                    placeholder="Например: керамика, фотография, шитьё, монтаж видео, веду соцсети"
                    aria-labelledby="q-skills"
                  />
                </Question>
              </>
            )}

            {step === 3 && (
              <>
                <Question group labelId="q-wishes" label="Чем хотели бы помогать фонду" hint="Можно выбрать несколько или написать своими словами">
                  <Ideas ideas={WISH_IDEAS} value={a.wishes} onChange={(v) => setAnswers({ wishes: v })} />
                  <TextBox
                    value={a.wishes}
                    onChange={(v) => setAnswers({ wishes: v })}
                    placeholder="Например: помогать на занятиях с детьми, снимать мероприятия"
                    aria-labelledby="q-wishes"
                  />
                </Question>
                <Question
                  label="Ваш опыт"
                  hint="Волонтёрство, работа с детьми или людьми с особенностями развития. Если опыта нет — это нормально, всему научим."
                >
                  <TextBox
                    value={a.experience}
                    onChange={(v) => setAnswers({ experience: v })}
                    placeholder="Например: год помогала в приюте для животных; с особыми детьми не работала, но готова учиться"
                  />
                </Question>
              </>
            )}

            {step === 4 && (
              <>
                <Question
                  label="Когда вы обычно свободны"
                  required
                  group
                  error={errors.availability}
                  hint={
                    <>
                      🧡 <b>Фонду особенно нужна помощь в будни днём</b> — группы из интернатов приезжают утром.
                    </>
                  }
                >
                  <Choices<Availability>
                    multiple
                    options={AVAILABILITY}
                    icons={AVAILABILITY_ICON}
                    subs={AVAILABILITY_SUB}
                    value={a.availability}
                    onChange={(v) => setAnswers({ availability: v })}
                  />
                </Question>
                <Question label="Как удобнее помогать" required group error={errors.formats}>
                  <Choices<Format>
                    multiple
                    options={FORMAT}
                    icons={FORMAT_ICON}
                    subs={FORMAT_SUB}
                    value={a.formats}
                    onChange={(v) => setAnswers({ formats: v })}
                  />
                </Question>
                <Question label="Как часто" group>
                  <Choices<Regularity>
                    options={REGULARITY}
                    icons={REGULARITY_ICON}
                    subs={REGULARITY_SUB}
                    value={[a.regularity]}
                    onChange={([v]) => setAnswers({ regularity: v })}
                  />
                </Question>
              </>
            )}

            {step === LAST && (
              <>
                <Review draft={draft} onEdit={(n) => goTo(n, { fromCheck: true })} />
                <label
                  data-error={errors.consent ? "" : undefined}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors ${
                    draft.consent ? "border-accent bg-soft/60" : errors.consent ? "border-red-300 bg-red-50" : "border-line"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={draft.consent}
                    onChange={(e) => {
                      set({ consent: e.target.checked });
                      setErrors({});
                    }}
                    className="mt-1 size-6 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span>
                    Согласен(на) на{" "}
                    <a href={FUND_DOCS.privacy} target="_blank" rel="noreferrer" className="text-link underline underline-offset-4">
                      обработку персональных данных
                    </a>{" "}
                    фондом «Дети Марии». Имя и контакт видит только координатор фонда, в AI-сервисы они не передаются.
                  </span>
                </label>
                {errors.consent && <p className="-mt-3 text-sm font-medium text-red-700">{errors.consent}</p>}
                {error && <ErrorBox text={`Не получилось отправить анкету: ${error}`} />}
                {sending && <Sending />}
              </>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 mt-auto flex min-w-0 gap-3 bg-gradient-to-t from-page from-70% to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step > 0 && !sending && (
            <button
              type="button"
              onClick={() => goTo(fromCheck ? LAST : step - 1)}
              {...flairHandlers}
              className={`btn-flair min-h-14 shrink-0 rounded-full border-2 border-line bg-surface px-5 font-semibold ${FLAIR.secondary}`}
              aria-label={fromCheck ? "Вернуться к проверке" : "Назад"}
            >
              ←<span className="hidden sm:inline"> {fromCheck ? "К проверке" : "Назад"}</span>
            </button>
          )}
          <button
            type="submit"
            disabled={sending}
            {...flairHandlers}
            className={`btn-flair min-h-14 flex-1 rounded-full bg-cta px-6 text-lg font-semibold text-white shadow-[0_14px_30px_-14px_var(--p-cta)] disabled:opacity-60 ${FLAIR.cta}`}
          >
            {sending
              ? "Отправляем…"
              : step === LAST
                ? "Отправить анкету"
                : fromCheck
                  ? "Готово, к проверке →"
                  : step === 0
                    ? "Начнём →"
                    : "Дальше →"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** На компьютере слева — все шаги анкеты списком: где вы сейчас, что уже пройдено, сколько осталось. */
function StepList(props: { step: number; reached: number; saved: boolean; onJump: (step: number) => void }) {
  const percent = Math.round((props.step / LAST) * 100);
  return (
    <aside className="sticky top-6 hidden flex-col self-start gap-5 rounded-[2rem] bg-surface p-5 md:flex lg:p-6">
      <div className="flex flex-col gap-1">
        <span className="font-display text-lg leading-tight font-semibold">Анкета волонтёра</span>
        <span className="text-sm text-hint">Займёт 5–7 минут</span>
      </div>

      <ol className="flex flex-col gap-1">
        {STEPS.map((s, n) => {
          const now = n === props.step;
          const done = n < props.step || (!now && n <= props.reached);
          return (
            <li key={s.short}>
              <button
                type="button"
                disabled={now || !done}
                onClick={() => props.onJump(n)}
                aria-current={now ? "step" : undefined}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                  now ? "bg-page font-semibold shadow-[0_10px_24px_-18px_var(--p-ink)]" : done ? "hover:bg-page/70" : "text-hint"
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors ${
                    now ? "bg-cta text-white" : done ? "bg-accent text-accent-text" : "border-2 border-line"
                  }`}
                  aria-hidden="true"
                >
                  {done ? "✓" : n + 1}
                </span>
                <span className="leading-tight">{s.short}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-hint">Готово на {percent}%</span>
          <span className={`text-accent transition-opacity duration-500 ${props.saved ? "opacity-100" : "opacity-0"}`}>
            ✓ Сохранено
          </span>
        </div>
      </div>

      <p className="text-sm text-hint">
        Ответы сохраняются на этом устройстве — можно закрыть страницу и вернуться позже.
      </p>
    </aside>
  );
}

/** Подзаголовок каждого шага — говорим, зачем это фонду. */
const STEP_INTRO = [
  "Займёт 5–7 минут. Ответы сохраняются на этом устройстве — можно вернуться позже.",
  "Так координатор поймёт, когда и где вам удобнее помогать.",
  "Пишите как есть, своими словами — по этому тексту мы подберём занятия.",
  "Можно выбрать готовое или написать своё. Не знаете — пропустите, подскажем на встрече.",
  "Отметьте всё, что подходит.",
  "Всё ли верно? Можно поправить любой ответ.",
];

/** Сверху: «Шаг 2 из 6», полоска шагов и отметка «Сохранено». Пройденные шаги (до reached) можно открыть нажатием. */
function Progress(props: { step: number; reached: number; saved: boolean; onJump: (step: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-hint">
          Шаг {props.step + 1} из {STEPS.length} · {STEPS[props.step].short}
        </span>
        <span
          className={`text-accent transition-opacity duration-500 ${props.saved ? "opacity-100" : "opacity-0"}`}
          aria-hidden={!props.saved}
        >
          ✓ Сохранено
        </span>
      </div>
      <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={props.step + 1}>
        {STEPS.map((s, n) => {
          const now = n === props.step;
          const open = !now && n <= props.reached;
          return (
            <button
              key={s.short}
              type="button"
              disabled={!open}
              onClick={() => props.onJump(n)}
              title={open ? `Открыть: ${s.short}` : s.short}
              aria-label={open ? `Открыть шаг «${s.short}»` : s.short}
              className="group h-2.5 flex-1 overflow-hidden rounded-full bg-line enabled:cursor-pointer"
            >
              <span
                className={`block h-full origin-left rounded-full transition-transform duration-500 ease-out group-enabled:group-hover:bg-pop ${
                  now ? "progress-now scale-x-100 bg-cta" : open ? "scale-x-100 bg-accent" : "scale-x-0 bg-accent"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Question(props: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  group?: boolean;
  labelId?: string;
  children: ReactNode;
}) {
  const Tag = props.group ? "div" : "label";
  return (
    <Tag className="flex flex-col gap-2" data-error={props.error ? "" : undefined}>
      <span id={props.labelId} className="text-lg font-semibold">
        {props.label}
        {props.required && <span className="text-cta"> *</span>}
      </span>
      {props.hint && <span className="-mt-1 text-sm text-hint">{props.hint}</span>}
      {props.children}
      {props.error && (
        <span role="alert" className="error-in text-sm font-medium text-red-700">
          {props.error}
        </span>
      )}
    </Tag>
  );
}

/** Крупные карточки-варианты: один (radio) или несколько (checkbox). Выбранная — зелёная, с галочкой. */
function Choices<T extends string>(props: {
  options: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
  icons?: Record<T, string>;
  subs?: Partial<Record<T, string>>;
  multiple?: boolean;
}) {
  const keys = Object.keys(props.options) as T[];
  function toggle(k: T) {
    haptic();
    if (!props.multiple) return props.onChange([k]);
    props.onChange(props.value.includes(k) ? props.value.filter((x) => x !== k) : [...props.value, k]);
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2" role={props.multiple ? "group" : "radiogroup"}>
      {keys.map((k, i) => {
        const on = props.value.includes(k);
        return (
          <button
            key={k}
            type="button"
            role={props.multiple ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => toggle(k)}
            style={{ animationDelay: `${i * 45}ms` }}
            className={`choice choice-in relative flex min-h-16 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left ${
              on ? "is-on border-accent bg-soft" : "border-line bg-page hover:border-accent/60 hover:bg-surface"
            }`}
          >
            {props.icons && (
              <span className="choice-icon text-2xl" aria-hidden="true">
                {props.icons[k]}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col break-words leading-tight">
              <span className="font-semibold">{props.options[k]}</span>
              {props.subs?.[k] && <span className="mt-0.5 text-sm text-hint">{props.subs[k]}</span>}
            </span>
            <span
              className={`choice-mark grid size-7 shrink-0 place-items-center border-2 text-sm font-bold ${
                props.multiple ? "rounded-lg" : "rounded-full"
              } ${on ? "border-accent bg-accent text-accent-text" : "border-line text-transparent"}`}
              aria-hidden="true"
            >
              ✓
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Поле для текста. Растёт вместе с текстом; с meter — подбадривает, когда написано достаточно. */
function TextBox(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  meter?: boolean;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 420)}px`;
  }, [props.value]);

  const len = props.value.trim().length;
  const level = len === 0 ? 0 : len < 40 ? 1 : len < 120 ? 2 : 3;
  const say = ["", "Хорошее начало — можно чуть подробнее", "Отлично! Ещё пара деталей не помешает", "Замечательно — так проще подобрать занятие 🧡"];

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        aria-labelledby={props["aria-labelledby"]}
        className={`${inputClass} min-h-28 resize-none transition-[border-color,box-shadow] focus:shadow-[0_0_0_4px_var(--p-soft)]`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        maxLength={2000}
        rows={3}
      />
      {props.meter && (
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${(level / 3) * 100}%` }}
            />
          </div>
          <span key={level} className="error-in text-sm text-hint">
            {say[level]}
          </span>
        </div>
      )}
    </div>
  );
}

/** Готовые варианты над полем: нажатие дописывает слово в текст, повторное — убирает. */
function Ideas(props: { ideas: string[]; value: string; onChange: (v: string) => void }) {
  const has = (idea: string) => props.value.toLowerCase().includes(idea.toLowerCase());

  function toggle(idea: string) {
    haptic();
    if (has(idea)) {
      const escaped = idea.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const cleaned = props.value
        .replace(new RegExp(`(,\\s*)?${escaped}`, "i"), "")
        .replace(/^\s*,\s*/, "")
        .trim();
      return props.onChange(cleaned);
    }
    const text = props.value.trim();
    props.onChange(text ? `${text.replace(/[,.;]\s*$/, "")}, ${idea.toLowerCase()}` : idea);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {props.ideas.map((idea, i) => {
        const on = has(idea);
        return (
          <button
            key={idea}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(idea)}
            style={{ animationDelay: `${i * 30}ms` }}
            className={`choice choice-in min-h-11 rounded-full border-2 px-4 py-1.5 text-[0.95rem] ${
              on ? "is-on border-accent bg-accent text-accent-text" : "border-line bg-page hover:border-accent/60"
            }`}
          >
            {on ? "✓ " : "+ "}
            {idea}
          </button>
        );
      })}
    </div>
  );
}

/** Все ответы одним списком, у каждого блока — «Изменить». */
function Review(props: { draft: Draft; onEdit: (step: number) => void }) {
  const d = props.draft;
  const a = d.answers;
  const list = <T extends string>(labels: Record<T, string>, values: T[]) => values.map((v) => labels[v]).join(", ");
  const rows: { step: number; items: [string, string][] }[] = [
    { step: 0, items: [["Имя", d.name], ["Контакт", d.contact]] },
    { step: 1, items: [["Занятость", OCCUPATION[a.occupation]], ["Регион", REGION[a.region]]] },
    { step: 2, items: [["О себе", a.about], ["Умею", a.skills]] },
    { step: 3, items: [["Хочу помогать", a.wishes], ["Опыт", a.experience]] },
    {
      step: 4,
      items: [
        ["Свободен(на)", list(AVAILABILITY, a.availability)],
        ["Формат", list(FORMAT, a.formats)],
        ["Как часто", REGULARITY[a.regularity]],
      ],
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={r.step} className="tile-in" style={{ animationDelay: `${i * 60}ms` }}>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">
              <span aria-hidden="true">{STEPS[r.step].icon}</span> {STEPS[r.step].short}
            </span>
            <button type="button" onClick={() => props.onEdit(r.step)} className="rounded-full px-3 py-1 text-sm font-semibold text-link hover:bg-soft">
              Изменить
            </button>
          </div>
          <dl className="flex flex-col gap-1.5">
            {r.items.map(([k, v]) => (
              <div key={k} className="flex flex-col sm:flex-row sm:gap-3">
                <dt className="shrink-0 text-sm text-hint sm:w-32 sm:pt-0.5">{k}</dt>
                <dd className="min-w-0 flex-1">
                  <LongText text={v.trim()} />
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        </div>
      ))}
    </div>
  );
}

/** Ответ на странице проверки: длинный текст — три строки и «…», нажатие показывает целиком.
    Очень длинные слова переносятся, чтобы текст не вылезал за карточку. */
function LongText(props: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);

  // обрезан ли текст на самом деле — зависит от ширины экрана, поэтому меряем после отрисовки
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setLong(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [props.text, open]);

  if (!props.text) return <p className="text-hint italic">не заполнено</p>;
  return (
    <div className="flex flex-col items-start gap-1">
      <p ref={ref} className={`whitespace-pre-line [overflow-wrap:anywhere] ${open ? "" : "line-clamp-3"}`}>
        {props.text}
      </p>
      {(long || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="-ml-2 rounded-full px-2 py-0.5 text-sm font-semibold text-link hover:bg-soft"
        >
          {open ? "Свернуть" : "… показать полностью"}
        </button>
      )}
    </div>
  );
}

/** Пока анкета уходит и AI её разбирает — спокойная анимация и понятные слова, что происходит. */
function Sending() {
  const phrases = ["Сохраняем анкету…", "Читаем ваши ответы…", "Подбираем, где вы нужнее всего…"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, phrases.length - 1)), 2600);
    return () => clearInterval(t);
  }, [phrases.length]);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-soft p-4" aria-live="polite">
      <span className="sending-dots flex gap-1.5" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span key={i} className="error-in font-medium">
        {phrases[i]}
      </span>
    </div>
  );
}

/** «Спасибо! Вот что мы о вас поняли» — профиль от AI. Если AI ещё не разобрал анкету, профиль пустой. */
function Thanks(props: { volunteer: Volunteer }) {
  const v = props.volunteer;
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    backend.roles().then(setRoles).catch(() => setRoles([])); // без названий ролей экран всё равно полезен
  }, []);

  const p = v.profile;
  const roleTitles = (p?.suitable_roles ?? [])
    .map((code) => roles.find((r) => r.code === code)?.title)
    .filter((t): t is string => !!t);
  const tags = [...new Set([...(p?.skills ?? []), ...(p?.interests ?? [])])];

  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-5">
      <Confetti />
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <svg viewBox="0 0 52 52" className="size-20" aria-hidden="true">
          <circle className="done-circle" cx="26" cy="26" r="24" fill="none" stroke="var(--p-accent)" strokeWidth="3" />
          <path className="done-check" d="M15 27 l7 7 l15 -16" fill="none" stroke="var(--p-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="tile-in font-display text-[1.75rem] leading-tight font-semibold">Спасибо, {v.name.split(" ")[0]}!</h1>
        <p className="tile-in [animation-delay:120ms]">
          Анкета у нас. Следующий шаг — короткое обучение, а после него вы сами запишетесь на собеседование с координатором.
        </p>
      </div>
      {p && (tags.length > 0 || roleTitles.length > 0) ? (
        <Card className="tile-in flex flex-col gap-4 [animation-delay:240ms]">
          <h2 className="text-xl font-bold">Вот что мы о вас поняли</h2>
          {p.summary && <p>{p.summary}</p>}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t, i) => (
                <span key={t} className="tile-in" style={{ animationDelay: `${360 + i * 50}ms` }}>
                  <Badge className="bg-page">{t}</Badge>
                </span>
              ))}
            </div>
          )}
          {roleTitles.length > 0 && (
            <div>
              <p className="font-semibold">Вам может подойти:</p>
              <ul className="mt-1 list-inside list-disc">
                {roleTitles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-hint">Если что-то не так — расскажите координатору на встрече.</p>
        </Card>
      ) : (
        <Card className="tile-in [animation-delay:240ms]">
          <p className="text-hint">Мы ещё разбираем вашу анкету — подходящие задачи появятся в личном кабинете.</p>
        </Card>
      )}
      <Button wide onClick={() => navigate("/training")}>
        Пройти обучение
      </Button>
    </div>
  );
}

/** Конфетти в цветах логотипа: один короткий залп, без библиотек. */
function Confetti() {
  const colors = ["var(--logo-yellow)", "var(--logo-orange)", "var(--logo-green)", "var(--logo-cyan)", "var(--logo-berry)", "var(--logo-blue)"];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 7) * 60}ms`,
            ["--dx" as string]: `${((i * 53) % 120) - 60}px`,
            ["--rot" as string]: `${(i * 97) % 720}deg`,
          }}
        />
      ))}
    </div>
  );
}
