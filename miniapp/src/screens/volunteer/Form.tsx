// Анкета волонтёра (T-07): сайт и Telegram Mini App.
// Вопросы — дословно как в анкете фонда (T-143, Яндекс Форма «Анкета волонтёра фонда „Дети Марии“»),
// плюс наш шаг «Когда и где удобно» — по нему работает умный поиск.
// Пошагово: один экран — одна тема, в конце «Проверьте ответы». Так не страшно начать и легко закончить.
// Имя, дата рождения и контакты хранятся только в нашей базе. Остальные ответы — обезличенно — разбирает AI.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import type {
  Answers,
  AnswerRegularity,
  Availability,
  ContactWay,
  Direction,
  Occupation,
  PersonalData,
  Region,
  Role,
  SpecialNeeds,
  Volunteer,
} from "../../api";
import { backend, getAccount, saveAccount, setVolunteerId } from "../../backend";
import { ANSWER_REGULARITY, AVAILABILITY, CONTACT_WAY, DIRECTION, OCCUPATION, REGION, SPECIAL_NEEDS } from "../../labels";
import { FUND_DOCS } from "../../Footer";
import { Icon, type IconName } from "../../icons";
import { navigate } from "../../router";
import { tg, tgUser } from "../../telegram";
import { Badge, Button, Card, ErrorBox, errorText, FLAIR, flairHandlers, inputClass } from "../../ui";

/** Формат участия — один ответ, как у фонда. В контракт уходит списком: «оба» — оба, «не знаю» — пусто. */
type FormatChoice = "offline" | "online" | "both" | "unsure";
type YesNo = "yes" | "no";

/** Вопросы с выбором без ответа по умолчанию (null) — у фонда они обязательные, человек выбирает сам. */
type Draft = {
  name: string;
  consent: boolean;
  step: number;
  personal: PersonalData;
  volunteerExperience: YesNo | null;
  specialNeeds: SpecialNeeds | null;
  format: FormatChoice | null;
  regularity: AnswerRegularity | null;
  answers: Answers;
};

const DRAFT_KEY = "form_draft";

/** Шаги анкеты по порядку: первые три — разделы анкеты фонда. fields — какие ошибки проверяем перед переходом дальше. */
const STEPS = [
  {
    title: "Немного о вас",
    short: "О вас",
    icon: "hand",
    fields: ["name", "birth_date", "phone", "email", "contact_ways"],
  },
  {
    title: "Опыт и навыки",
    short: "Опыт",
    icon: "pencil",
    fields: ["volunteer_experience", "special_needs", "skills"],
  },
  {
    title: "Направления волонтёрства и формат работы",
    short: "Направления",
    icon: "heart",
    fields: ["directions", "format", "regularity", "source"],
  },
  { title: "Когда и где вам удобно", short: "Время", icon: "calendar", fields: ["availability"] },
  { title: "Проверьте анкету", short: "Проверка", icon: "check", fields: ["consent"] },
] as const;

const LAST = STEPS.length - 1;

const OCCUPATION_ICON: Record<Occupation, IconName> = {
  student: "graduation",
  pensioner: "leaf",
  remote: "laptop",
  employed: "building",
  schoolkid: "backpack",
  other: "sparkles",
};

const AVAILABILITY_ICON: Record<Availability, IconName> = {
  weekday_morning: "sunrise",
  weekday_day: "sun",
  weekday_evening: "moon",
  weekend: "palette",
};

/** Подсказка под вариантом — то, что фонду важно сказать сразу. */
const AVAILABILITY_SUB: Partial<Record<Availability, string>> = {
  weekday_morning: "Очень нужно",
  weekday_day: "Очень нужно",
  weekend: "Мастерские по субботам",
};

const FORMAT_CHOICE: Record<FormatChoice, string> = {
  offline: "Очно",
  online: "Онлайн",
  both: "Подходит и очный, и онлайн-формат",
  unsure: "Пока не знаю — хочу обсудить варианты на встрече",
};
const FORMAT_LIST: Record<FormatChoice, Answers["formats"]> = {
  offline: ["offline"],
  online: ["online"],
  both: ["offline", "online"],
  unsure: [],
};

const YES_NO: Record<YesNo, string> = { yes: "Да", no: "Нет" };

/** Готовые слова для поля про навыки — по ролям фонда (data/roles.json). */
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

function emptyDraft(): Draft {
  const tgName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ");
  return {
    // имя: из Telegram или то, что человек написал при регистрации
    name: tgName || (getAccount()?.name ?? ""),
    consent: false,
    step: 0,
    // что уже знаем, подставляем сами: ник из Telegram и почту, с которой человек зарегистрировался
    personal: {
      birth_date: null,
      phone: "",
      email: getAccount()?.email ?? "",
      telegram: tgUser?.username ? `@${tgUser.username}` : "",
      contact_ways: [],
    },
    volunteerExperience: null,
    specialNeeds: null,
    format: null,
    regularity: null,
    answers: {
      about: "",
      skills: "",
      wishes: "",
      experience: "",
      directions: [],
      source: "",
      availability: [],
      occupation: "other",
      region: "moscow",
      formats: [],
      regularity: "any",
    },
  };
}

/** Черновик и шаг сохраняются на устройстве — чтобы не потерять текст, если человек отвлёкся.
    Черновик старой анкеты (без personal) не подходит — начинаем с пустого. */
function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (saved?.answers && saved?.personal) {
      const empty = emptyDraft();
      const draft = {
        ...empty,
        ...saved,
        personal: { ...empty.personal, ...saved.personal },
        answers: { ...empty.answers, ...saved.answers },
      };
      return { ...draft, step: Math.min(Math.max(Number(draft.step) || 0, 0), LAST) };
    }
  } catch {
    /* нет черновика или он испорчен — начинаем с пустого */
  }
  return emptyDraft();
}

type Field = (typeof STEPS)[number]["fields"][number];
type Errors = Partial<Record<Field, string>>;

const CHOOSE = "Выберите вариант";

/** Дата рождения: настоящая дата, человеку от 10 до 100 лет. */
function birthDateError(value: string | null): string | undefined {
  if (!value) return "Укажите дату рождения";
  const years = (Date.now() - new Date(value).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (Number.isNaN(years) || years < 10 || years > 100) return "Проверьте дату — похоже на опечатку";
}

function validate(d: Draft): Errors {
  const e: Errors = {};
  const p = d.personal;
  if (!d.name.trim()) e.name = "Напишите имя и фамилию";
  e.birth_date = birthDateError(p.birth_date);
  const digits = p.phone.replace(/\D/g, "");
  if (!digits) e.phone = "Оставьте номер телефона";
  else if (digits.length < 10 || digits.length > 15) e.phone = "Проверьте номер: например, +7 900 000-00-00";
  if (!p.email.trim()) e.email = "Оставьте электронную почту";
  else if (!/^\S+@\S+\.\S+$/.test(p.email.trim())) e.email = "Похоже на опечатку: нужна почта вида name@mail.ru";
  if (p.contact_ways.length === 0) e.contact_ways = "Отметьте хотя бы один вариант";
  if (!d.volunteerExperience) e.volunteer_experience = CHOOSE;
  if (!d.specialNeeds) e.special_needs = CHOOSE;
  if (!d.answers.skills.trim()) e.skills = "Расскажите хотя бы пару слов";
  if (!d.answers.directions?.length) e.directions = "Отметьте хотя бы один вариант";
  if (!d.format) e.format = CHOOSE;
  if (!d.regularity) e.regularity = CHOOSE;
  if (!d.answers.source?.trim()) e.source = "Напишите хотя бы пару слов";
  if (d.answers.availability.length === 0) e.availability = "Отметьте хотя бы один вариант";
  if (!d.consent) e.consent = "Без согласия мы не можем сохранить анкету";
  for (const key of Object.keys(e) as Field[]) if (!e[key]) delete e[key];
  return e;
}

/** Ответы для контракта: выбор формата и регулярности переводим в поля Answers, тексты обрезаем. */
function toAnswers(d: Draft): Answers {
  const a = d.answers;
  return {
    ...a,
    about: a.about.trim(),
    skills: a.skills.trim(),
    // «Другое» своими словами — только если отмечено «Другое»
    wishes: a.directions?.includes("other") ? a.wishes.trim() : "",
    experience: a.experience.trim(),
    source: a.source?.trim() ?? "",
    volunteer_experience: d.volunteerExperience ? d.volunteerExperience === "yes" : null,
    special_needs: d.specialNeeds,
    formats: d.format ? FORMAT_LIST[d.format] : [],
    regularity: d.regularity ?? "any",
  };
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
    const field = document.querySelector<HTMLElement>(
      "[data-step] input:not([type=checkbox]):not([type=radio]), [data-step] textarea",
    );
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
  const setPersonal = (patch: Partial<PersonalData>) => {
    setErrors({});
    setDraft((d) => ({ ...d, personal: { ...d.personal, ...patch } }));
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
    // фокус — в первое поле с ошибкой: скринридер прочитает подпись и текст ошибки, с клавиатуры можно сразу исправить
    setTimeout(() => {
      const box = document.querySelector("[data-error]");
      box?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
      box?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
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
      const p = draft.personal;
      const personal = { ...p, phone: p.phone.trim(), email: p.email.trim(), telegram: p.telegram.trim() };
      const v = await backend.submit({
        name: draft.name.trim(),
        contact: personal.phone, // главный контакт в карточках и поиске — телефон, остальное в personal
        telegram_id: tgUser?.id ?? null,
        answers: toAnswers(draft),
        personal,
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
  const p = draft.personal;
  const directions = a.directions ?? [];

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
            <span className="step-icon grid size-14 shrink-0 place-items-center rounded-2xl bg-soft text-accent">
              <Icon name={STEPS[step].icon} className="size-8" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="step-heading min-w-0 [overflow-wrap:anywhere] font-display text-[1.6rem] leading-tight font-semibold tracking-tight text-balance md:text-[2rem]"
              >
                {STEPS[step].title}
              </h1>
              <p className="text-hint">{STEP_INTRO[step]}</p>
            </div>
          </div>

          <div ref={questionsRef} className="flex flex-col gap-6">
            {step === 0 && (
              <>
                <Question label="Имя и Фамилия" required error={errors.name} errorId="err-name">
                  <input
                    className={inputClass}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "err-name" : undefined}
                    value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    autoComplete="name"
                    enterKeyHint="next"
                    maxLength={100}
                    placeholder="Мария Иванова"
                  />
                </Question>
                <Question label="Дата Рождения" required error={errors.birth_date} errorId="err-birth-date">
                  <input
                    type="date"
                    className={inputClass}
                    aria-invalid={!!errors.birth_date}
                    aria-describedby={errors.birth_date ? "err-birth-date" : undefined}
                    value={p.birth_date ?? ""}
                    onChange={(e) => setPersonal({ birth_date: e.target.value || null })}
                    autoComplete="bday"
                    min="1920-01-01"
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </Question>
                <Question label="Номер телефона" required error={errors.phone} errorId="err-phone">
                  <input
                    type="tel"
                    className={inputClass}
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? "err-phone" : undefined}
                    value={p.phone}
                    onChange={(e) => setPersonal({ phone: e.target.value })}
                    autoComplete="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                    maxLength={50}
                    placeholder="+7 900 000-00-00"
                  />
                </Question>
                <Question label="Электронная почта" required error={errors.email} errorId="err-email">
                  <input
                    type="email"
                    className={inputClass}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "err-email" : undefined}
                    value={p.email}
                    onChange={(e) => setPersonal({ email: e.target.value })}
                    autoComplete="email"
                    inputMode="email"
                    enterKeyHint="next"
                    maxLength={200}
                    placeholder="name@mail.ru"
                  />
                </Question>
                <Question label="Telegram" hint="Укажите, пожалуйста, ваш Telegram, если он отличается от номера телефона">
                  <input
                    className={inputClass}
                    value={p.telegram}
                    onChange={(e) => setPersonal({ telegram: e.target.value })}
                    enterKeyHint="next"
                    maxLength={100}
                    placeholder="@nickname"
                  />
                </Question>
                <Question
                  label="Как с вами удобнее всего связываться?"
                  required
                  group
                  hint="Можно выбрать несколько вариантов"
                  error={errors.contact_ways}
                  errorId="err-contact-ways"
                >
                  <Choices<ContactWay>
                    multiple
                    options={CONTACT_WAY}
                    value={p.contact_ways}
                    onChange={(v) => setPersonal({ contact_ways: v })}
                  />
                </Question>
              </>
            )}

            {step === 1 && (
              <>
                <Question
                  label="Есть ли у вас опыт волонтёрской деятельности?"
                  required
                  group
                  error={errors.volunteer_experience}
                  errorId="err-volunteer-experience"
                >
                  <Choices<YesNo>
                    options={YES_NO}
                    value={draft.volunteerExperience ? [draft.volunteerExperience] : []}
                    onChange={([v]) => set({ volunteerExperience: v })}
                  />
                </Question>
                <Question
                  label="Есть ли у вас опыт работы или взаимодействия с людьми с особенностями развития?"
                  required
                  group
                  hint="В том числе с детьми и подростками, оставшимися без попечения родителей."
                  error={errors.special_needs}
                  errorId="err-special-needs"
                >
                  <Choices<SpecialNeeds>
                    options={SPECIAL_NEEDS}
                    value={draft.specialNeeds ? [draft.specialNeeds] : []}
                    onChange={([v]) => set({ specialNeeds: v })}
                  />
                </Question>
                <Question
                  group
                  labelId="q-skills"
                  label="Расскажите о своих навыках, опыте или увлечениях, которые могут быть полезны в волонтёрской деятельности."
                  required
                  hint="Например: творчество, педагогика, психология, фотография, видеосъёмка, организация мероприятий, работа с социальными сетями и т.д."
                  error={errors.skills}
                  errorId="err-skills"
                >
                  <Ideas ideas={SKILL_IDEAS} value={a.skills} onChange={(v) => setAnswers({ skills: v })} />
                  <TextBox
                    errorId={errors.skills ? "err-skills" : undefined}
                    value={a.skills}
                    onChange={(v) => setAnswers({ skills: v })}
                    placeholder="Например: 20 лет работала учителем рисования, люблю керамику, фотографирую"
                    aria-labelledby="q-skills"
                    meter
                  />
                </Question>
              </>
            )}

            {step === 2 && (
              <>
                <Question
                  label="В каких направлениях вам было бы интересно помогать?"
                  required
                  group
                  hint="Можно выбрать несколько вариантов"
                  error={errors.directions}
                  errorId="err-directions"
                >
                  <Choices<Direction>
                    multiple
                    options={DIRECTION}
                    value={directions}
                    onChange={(v) => setAnswers({ directions: v })}
                  />
                </Question>
                {directions.includes("other") && (
                  <Question label="Другое — что именно?">
                    <TextBox
                      value={a.wishes}
                      onChange={(v) => setAnswers({ wishes: v })}
                      placeholder="Например: подвозить ребят на своей машине, переводить тексты"
                    />
                  </Question>
                )}
                <Question
                  label="Какой формат участия вам подходит?"
                  required
                  group
                  error={errors.format}
                  errorId="err-format"
                >
                  <Choices<FormatChoice>
                    options={FORMAT_CHOICE}
                    value={draft.format ? [draft.format] : []}
                    onChange={([v]) => set({ format: v })}
                  />
                </Question>
                <Question
                  label="Какой формат волонтёрства вам подходит по регулярности?"
                  required
                  group
                  error={errors.regularity}
                  errorId="err-regularity"
                >
                  <Choices<AnswerRegularity>
                    options={ANSWER_REGULARITY}
                    value={draft.regularity ? [draft.regularity] : []}
                    onChange={([v]) => set({ regularity: v })}
                  />
                </Question>
                <Question label="Есть ли что-то ещё, что вы хотели бы рассказать о себе или своём желании помогать?">
                  <TextBox value={a.about} onChange={(v) => setAnswers({ about: v })} placeholder="Необязательно" />
                </Question>
                <Question label="Откуда вы узнали о фонде «Дети Марии»?" required error={errors.source} errorId="err-source">
                  <input
                    className={inputClass}
                    aria-invalid={!!errors.source}
                    aria-describedby={errors.source ? "err-source" : undefined}
                    value={a.source ?? ""}
                    onChange={(e) => setAnswers({ source: e.target.value })}
                    enterKeyHint="next"
                    maxLength={500}
                    placeholder="Например: от друзей, из Telegram-канала, на ярмарке"
                  />
                </Question>
              </>
            )}

            {step === 3 && (
              <>
                <Question
                  label="Когда вы обычно свободны"
                  required
                  group
                  error={errors.availability}
                  errorId="err-availability"
                  hint={
                    <>
                      <Icon name="heart" className="mr-1 size-[1.1em] align-[-0.18em] text-cta" />
                      <b>Фонду особенно нужна помощь в будни днём</b> — группы из интернатов приезжают утром.
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
                <Question
                  label="Где вы живёте"
                  group
                  hint="Фонд работает в Москве, Подмосковье, Ярославской области и Северной Осетии"
                >
                  <Choices<Region> options={REGION} value={[a.region]} onChange={([v]) => setAnswers({ region: v })} />
                </Question>
                <Question label="Чем вы сейчас заняты" group>
                  <Choices<Occupation>
                    options={OCCUPATION}
                    icons={OCCUPATION_ICON}
                    value={[a.occupation]}
                    onChange={([v]) => setAnswers({ occupation: v })}
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
                    aria-invalid={!!errors.consent}
                    aria-describedby={errors.consent ? "err-consent" : undefined}
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
                    фондом «Дети Марии». Имя, дату рождения и контакты видит только координатор фонда, в AI-сервисы они не передаются.
                  </span>
                </label>
                {errors.consent && (
                  <p id="err-consent" role="alert" className="error-in -mt-3 text-sm font-medium text-red-700">
                    {errors.consent}
                  </p>
                )}
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
        <span className="text-sm text-hint">Займёт не более 10 минут</span>
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
        <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
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

/** Подзаголовок каждого шага. Первый — приветствие из анкеты фонда. */
const STEP_INTRO = [
  "Мы рады, что вы решили стать волонтёром фонда «Дети Марии»! Заполните, пожалуйста, эту небольшую анкету, " +
    "чтобы мы могли познакомиться с вами поближе, узнать о вашем опыте и интересах и понять, какое направление " +
    "волонтёрства может вам подойти. Заполнение анкеты займёт не более 10 минут.",
  "Если опыта нет — это нормально, всему научим.",
  "Не знаете, что выбрать, — отметьте «Пока не знаю», обсудим на встрече.",
  "Так координатор поймёт, когда и где вам удобнее помогать. Отметьте всё, что подходит.",
  "Всё ли верно? Можно поправить любой ответ. Мы внимательно рассмотрим ответы и свяжемся с вами, " +
    "чтобы договориться о встрече-знакомстве.",
];

/** Сверху: «Шаг 2 из 6», полоска шагов и отметка «Сохранено». Пройденные шаги (до reached) можно открыть нажатием.
    Номер шага — текстом с aria-live; полоска — только картинка, кроме кнопок перехода к пройденным шагам
    (они высотой 44 px — по полоске легко попасть пальцем, — а места занимают как сама полоска). */
function Progress(props: { step: number; reached: number; saved: boolean; onJump: (step: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-hint" aria-live="polite">
          Шаг {props.step + 1} из {STEPS.length} · {STEPS[props.step].short}
        </span>
        <span
          className={`text-accent transition-opacity duration-500 ${props.saved ? "opacity-100" : "opacity-0"}`}
          aria-hidden={!props.saved}
        >
          ✓ Сохранено
        </span>
      </div>
      <div className="-my-[1.0625rem] flex gap-1.5">
        {STEPS.map((s, n) => {
          const now = n === props.step;
          const open = !now && n <= props.reached;
          const bar = (
            <span className="block h-2.5 w-full overflow-hidden rounded-full bg-line">
              <span
                className={`block h-full origin-left rounded-full transition-transform duration-500 ease-out group-hover:bg-pop ${
                  now ? "progress-now scale-x-100 bg-cta" : open ? "scale-x-100 bg-accent" : "scale-x-0 bg-accent"
                }`}
              />
            </span>
          );
          return open ? (
            <button
              key={s.short}
              type="button"
              onClick={() => props.onJump(n)}
              title={`Открыть: ${s.short}`}
              aria-label={`Вернуться к шагу «${s.short}»`}
              className="group flex h-11 flex-1 cursor-pointer items-center"
            >
              {bar}
            </button>
          ) : (
            <span key={s.short} className="flex h-11 flex-1 items-center" aria-hidden="true">
              {bar}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Вопрос анкеты. group — несколько полей или вариантов: div с ролью group и подписью вместо label.
    errorId — id текста ошибки, на него ссылается поле через aria-describedby (у группы — сама группа). */
function Question(props: {
  label: string;
  hint?: ReactNode;
  error?: string;
  errorId?: string;
  required?: boolean;
  group?: boolean;
  labelId?: string;
  children: ReactNode;
}) {
  const autoId = useId();
  const labelId = props.labelId ?? autoId;
  const Tag = props.group ? "div" : "label";
  const groupProps = props.group
    ? { role: "group", "aria-labelledby": labelId, "aria-describedby": props.error ? props.errorId : undefined }
    : {};
  return (
    <Tag className="flex flex-col gap-2" data-error={props.error ? "" : undefined} {...groupProps}>
      <span id={labelId} className="text-lg font-semibold">
        {props.label}
        {props.required && <span className="text-cta"> *</span>}
      </span>
      {props.hint && <span className="-mt-1 text-sm text-hint">{props.hint}</span>}
      {props.children}
      {props.error && (
        <span id={props.errorId} role="alert" className="error-in text-sm font-medium text-red-700">
          {props.error}
        </span>
      )}
    </Tag>
  );
}

/** Крупные карточки-варианты: один (radio) или несколько (checkbox). Выбранная — зелёная, с галочкой.
    Внутри карточки — настоящий input (скрыт): стрелки переключают вариант, пробел отмечает. Подпись группы — у Question. */
function Choices<T extends string>(props: {
  options: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
  icons?: Record<T, IconName>;
  subs?: Partial<Record<T, string>>;
  multiple?: boolean;
}) {
  const name = useId();
  const keys = Object.keys(props.options) as T[];
  function toggle(k: T) {
    haptic();
    if (!props.multiple) return props.onChange([k]);
    props.onChange(props.value.includes(k) ? props.value.filter((x) => x !== k) : [...props.value, k]);
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
      {keys.map((k, i) => {
        const on = props.value.includes(k);
        return (
          <label
            key={k}
            style={{ animationDelay: `${i * 45}ms` }}
            className={`choice choice-in relative flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left select-none ${
              on ? "is-on border-accent bg-soft" : "border-line bg-page hover:border-accent/60 hover:bg-surface"
            }`}
          >
            <input
              type={props.multiple ? "checkbox" : "radio"}
              name={name}
              value={k}
              checked={on}
              onChange={() => toggle(k)}
              className="sr-only"
            />
            {props.icons && (
              <span className="choice-icon text-accent">
                <Icon name={props.icons[k]} className="size-7" />
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
          </label>
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
  /** id текста ошибки — поле отмечается как неверное и ссылается на него */
  errorId?: string;
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
  const say = ["", "Хорошее начало — можно чуть подробнее", "Отлично! Ещё пара деталей не помешает", "Замечательно — так проще подобрать занятие"];

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        aria-labelledby={props["aria-labelledby"]}
        aria-invalid={!!props.errorId}
        aria-describedby={props.errorId}
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
            {level === 3 && <Icon name="heart" className="ml-1 size-[1.1em] align-[-0.18em] text-cta" />}
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
            <span aria-hidden="true">{on ? "✓ " : "+ "}</span>
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
  const p = d.personal;
  const list = <T extends string>(labels: Record<T, string>, values: T[]) => values.map((v) => labels[v]).join(", ");
  const directions = list(DIRECTION, a.directions ?? []);
  const other = a.directions?.includes("other") && a.wishes.trim();
  const rows: { step: number; items: [string, string][] }[] = [
    {
      step: 0,
      items: [
        ["Имя", d.name],
        ["Дата рождения", p.birth_date ? new Date(p.birth_date).toLocaleDateString("ru-RU") : ""],
        ["Телефон", p.phone],
        ["Почта", p.email],
        ["Telegram", p.telegram],
        ["Связаться", list(CONTACT_WAY, p.contact_ways)],
      ],
    },
    {
      step: 1,
      items: [
        ["Опыт волонтёрства", d.volunteerExperience ? YES_NO[d.volunteerExperience] : ""],
        ["Опыт с особенностями развития", d.specialNeeds ? SPECIAL_NEEDS[d.specialNeeds] : ""],
        ["Навыки и увлечения", a.skills],
      ],
    },
    {
      step: 2,
      items: [
        ["Направления", other ? `${directions}: ${other}` : directions],
        ["Формат", d.format ? FORMAT_CHOICE[d.format] : ""],
        ["Регулярность", d.regularity ? ANSWER_REGULARITY[d.regularity] : ""],
        ["Ещё о себе", a.about],
        ["Откуда узнали", a.source ?? ""],
      ],
    },
    {
      step: 3,
      items: [
        ["Свободен(на)", list(AVAILABILITY, a.availability)],
        ["Регион", REGION[a.region]],
        ["Занятость", OCCUPATION[a.occupation]],
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
              <Icon name={STEPS[r.step].icon} className="mr-1.5 size-[1.15em] align-[-0.2em] text-accent" />
              {STEPS[r.step].short}
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
