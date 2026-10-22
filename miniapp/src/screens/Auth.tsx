// Регистрация и вход по почте и паролю — одна страница для волонтёра и координатора фонда.
// Регистрация в два шага: форма → код из письма (CodeStep) → кабинет. Если почта на сервере не настроена,
// бэкенд регистрирует сразу, без кода. «Забыли пароль?»: почта (ForgotStep) → код и новый пароль (CodeStep).
// После входа: волонтёр — в личный кабинет (/me), координатор — в кабинет фонда (/admin).
// Слева форма, справа на компьютере — 3D-лента сцен с лендинга (Showcase), на телефоне сцены сменяются
// прямо в карточке (SceneStrip). Движения — классы auth-* в index.css, при «уменьшении движения» выключены.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type Ref } from "react";

import type { AccountRole, AuthOut, CodeSent } from "../api";
import { auth, saveSession } from "../backend";
import { FUND_DOCS } from "../Footer";
import { Icon, type IconName } from "../icons";
import { navigate } from "../router";
import { tg } from "../telegram";
import { ErrorBox, errorText, FLAIR, flairHandlers, inputClass } from "../ui";
import VolunteerScenes, { SCENES } from "./volunteer/VolunteerScenes";

type Mode = "register" | "login";
/** что сейчас на карточке: вход, регистрация, «Забыли пароль?» или код из письма */
type View = Mode | "forgot" | "code";

const ROLE: Record<AccountRole, { title: string; sub: string; icon: IconName }> = {
  volunteer: { title: "Я волонтёр", sub: "хочу помогать фонду", icon: "handHeart" },
  coordinator: { title: "Я координатор", sub: "работаю в фонде", icon: "house" },
};

export default function Auth(props: { mode?: Mode; role?: AccountRole }) {
  const [mode, setMode] = useState<Mode>(props.mode ?? "register");
  const [role, setRole] = useState<AccountRole>(props.role ?? "volunteer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // в каком поле ошибка — оно получает фокус, aria-invalid и ссылку на текст ошибки
  const [badField, setBadField] = useState<"email" | "password" | null>(null);
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [forgot, setForgot] = useState(false); // «Забыли пароль?»: почта → код и новый пароль
  // куда «листается» карточка при смене шага: вперёд — справа, назад — слева
  const [back, setBack] = useState(false);
  const [shaking, setShaking] = useState(false); // ошибка в форме — карточка коротко качается
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const register = mode === "register";
  const view: View = sent ? "code" : forgot ? "forgot" : mode;

  function enter(out: AuthOut) {
    saveSession(out);
    const next =
      out.account.role === "coordinator"
        ? "/admin"
        : register && location.pathname === "/form"
          ? "/form"
          : "/me";
    navigate(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (register && !cleanName) {
      setShaking(true);
      return setError("Напишите, как вас зовут");
    }
    const clean = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return fail("email", "Похоже на опечатку в почте: нужно вида name@mail.ru");
    if (register && password.length < 6) return fail("password", "Пароль — хотя бы 6 символов");
    if (!password) return fail("password", "Введите пароль");
    setSending(true);
    setError("");
    setBadField(null);
    try {
      const out = register
        ? await auth.register({ name: cleanName, email: clean, password, role, code: code.trim() })
        : await auth.login({ email: clean, password });
      if ("pending" in out) {
        setBack(false);
        setSent(out);
      } else enter(out);
    } catch (err) {
      setError(errorText(err));
      setShaking(true);
    } finally {
      setSending(false);
    }
  }

  function fail(field: "email" | "password", text: string) {
    setError(text);
    setBadField(field);
    setShaking(true);
    (field === "email" ? emailRef : passwordRef).current?.focus();
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setBack(next === "login"); // «Вход» на переключателе слева, «Регистрация» — справа
    setMode(next);
    setError("");
    setBadField(null);
  }

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] md:gap-8">
      {/* появление — на обёртке, покачивание — на карточке: иначе после покачивания карточка появлялась бы заново */}
      <div className="tile-in min-w-0">
        <section
          onAnimationEnd={(e) => e.target === e.currentTarget && setShaking(false)}
          className={`relative flex h-full min-w-0 flex-col gap-6 overflow-hidden rounded-[2rem] bg-surface p-5 shadow-[0_24px_60px_-40px_var(--p-ink)] sm:p-7 ${shaking ? "shake" : ""}`}
        >
          <SceneStrip />

          {(view === "login" || view === "register") && <ModeTabs mode={mode} onChange={switchMode} />}

          {/* key — при смене шага карточка «перелистывается», поля появляются по очереди */}
          <div key={view} className={`flex min-w-0 flex-1 flex-col gap-6 ${back ? "step-in-back" : "step-in-forward"}`}>
            {sent ? (
              <CodeStep
                sent={sent}
                purpose={forgot ? "reset" : "signup"}
                onBack={() => {
                  setBack(true);
                  setSent(null);
                }}
                onDone={enter}
              />
            ) : forgot ? (
              <ForgotStep
                email={email}
                onEmail={setEmail}
                onSent={(out) => {
                  setBack(false);
                  setSent(out);
                }}
                onBack={() => {
                  setBack(true);
                  setForgot(false);
                }}
              />
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">
                    {register ? "Регистрация" : "Вход в аккаунт"}
                  </h1>
                  <p className="text-hint">
                    {register
                      ? role === "coordinator"
                        ? "После регистрации откроется кабинет фонда."
                        : location.pathname === "/form"
                          ? "После регистрации вы сразу продолжите заполнение анкеты."
                          : "После регистрации откроется личный кабинет."
                      : "Введите почту и пароль, с которыми регистрировались. Роль определится автоматически."}
                  </p>
                </div>

                <form onSubmit={submit} noValidate className="auth-stagger flex flex-col gap-5">
                  {register && (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-2 font-semibold">Зарегистрироваться как</legend>
                      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                        {(Object.keys(ROLE) as AccountRole[]).map((r) => {
                          const on = role === r;
                          return (
                            <label
                              key={r}
                              className={`choice relative flex cursor-pointer flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left select-none ${
                                on ? "is-on border-accent bg-page" : "border-transparent bg-page/60 hover:border-line"
                              }`}
                            >
                              <input
                                type="radio"
                                name="auth-role"
                                value={r}
                                checked={on}
                                onChange={() => {
                                  setRole(r);
                                  setError("");
                                  setBadField(null);
                                }}
                                className="sr-only"
                              />
                              {on && (
                                <span className="choice-mark absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full bg-accent text-accent-text">
                                  <Icon name="check" className="size-4" />
                                </span>
                              )}
                              <Icon name={ROLE[r].icon} className="choice-icon size-7 text-accent" />
                              <span className="leading-tight font-semibold">{ROLE[r].title}</span>
                              <span className="text-sm leading-tight text-hint">{ROLE[r].sub}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}

                  {register && (
                    <Label text="Как вас зовут" hint="Так к вам будут обращаться в кабинете">
                      <input
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Например, Анна Петрова"
                        maxLength={100}
                        className={inputClass}
                      />
                    </Label>
                  )}

                  <Label text="Почта">
                    <input
                      ref={emailRef}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      aria-invalid={badField === "email"}
                      aria-describedby={badField === "email" ? "auth-error" : undefined}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@mail.ru"
                      className={inputClass}
                    />
                  </Label>

                  <Label text="Пароль" hint={register ? "Не меньше 6 символов" : undefined}>
                    <PasswordInput
                      inputRef={passwordRef}
                      invalid={badField === "password"}
                      value={password}
                      onChange={setPassword}
                      autoComplete={register ? "new-password" : "current-password"}
                    />
                  </Label>

                  {register && role === "coordinator" && (
                    <Label text="Код фонда" hint="Его выдаёт руководитель фонда — чтобы в кабинет фонда не попали посторонние">
                      <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" className={inputClass} />
                    </Label>
                  )}

                  {error && <ErrorBox id="auth-error" text={error} />}

                  <button
                    type="submit"
                    disabled={sending}
                    {...flairHandlers}
                    className={`btn-flair min-h-14 w-full rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] disabled:opacity-60 ${FLAIR.cta}`}
                  >
                    {sending ? "Секунду…" : register ? "Зарегистрироваться" : "Войти"}
                  </button>

                  {!register && (
                    <button
                      type="button"
                      onClick={() => {
                        setBack(false);
                        setForgot(true);
                        setError("");
                      }}
                      className="self-start font-semibold text-link underline"
                    >
                      Забыли пароль?
                    </button>
                  )}

                  {register && (
                    <p className="text-sm text-hint">
                      Нажимая «Зарегистрироваться», вы соглашаетесь с{" "}
                      <a href={FUND_DOCS.privacy} target="_blank" rel="noreferrer" className="text-link underline">
                        политикой обработки персональных данных
                      </a>
                      .
                    </p>
                  )}
                </form>

                {tg?.initData && role === "volunteer" && (
                  <p className="rounded-2xl bg-page px-4 py-3 text-hint">
                    В Telegram можно и без регистрации —{" "}
                    <button type="button" onClick={() => navigate("/form")} className="font-semibold text-link underline">
                      сразу заполнить анкету
                    </button>
                    .
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      <Showcase view={view} role={role} />
    </div>
  );
}

/** Переключатель «Вход / Регистрация»: зелёная подложка переезжает под выбранную кнопку. */
function ModeTabs(props: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div role="group" aria-label="Вход или регистрация" className="relative grid grid-cols-2 rounded-full bg-page p-1">
      <span
        aria-hidden="true"
        className={`auth-tabs-pill absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-accent shadow-[0_8px_18px_-10px_var(--p-accent)] ${
          props.mode === "register" ? "translate-x-full" : ""
        }`}
      />
      {(["login", "register"] as Mode[]).map((m) => {
        const on = props.mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => props.onChange(m)}
            className={`relative min-h-12 rounded-full px-3 font-semibold transition-colors duration-300 ${
              on ? "text-accent-text" : "text-ink hover:text-accent"
            }`}
          >
            {m === "login" ? "Вход" : "Регистрация"}
          </button>
        );
      })}
    </div>
  );
}

/** Номер сцены, который сам сменяется раз в ms миллисекунд. При «уменьшении движения» — стоит на первой. */
function useCycle(count: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setI((n) => (n + 1) % count), ms);
    return () => clearInterval(timer);
  }, [count, ms]);
  return i;
}

/** Телефон: вверху карточки сменяются сцены «чем помогают волонтёры» — как живые картинки на лендинге. */
function SceneStrip() {
  const i = useCycle(SCENES.length, 3200);
  const s = SCENES[i];
  return (
    <div aria-hidden="true" className="flex items-center gap-3 rounded-3xl bg-page p-2 pr-4 md:hidden">
      <div key={i} className="auth-scene-in w-28 shrink-0">
        {s.art}
      </div>
      <div key={`text-${i}`} className="auth-copy-in min-w-0">
        <p className="text-sm text-hint">Чем помогают волонтёры</p>
        <p className="leading-snug font-semibold">{s.title}</p>
      </div>
    </div>
  );
}

const SHOWCASE: Record<"login" | "volunteer" | "coordinator" | "forgot" | "code", { title: string; text: string; points: string[] }> = {
  login: {
    title: "С возвращением!",
    text: "Войдите — и продолжите с того места, где остановились.",
    points: ["Ваши занятия", "Сообщения от фонда", "Обучение и тест"],
  },
  volunteer: {
    title: "Творческие мастерские ждут вас",
    text: "Керамика, живопись, валяние и кулинария вместе с ребятами.",
    points: ["Анкета за 5–7 минут", "Обучение онлайн", "Часы для «Добро.рф»"],
  },
  coordinator: {
    title: "Кабинет фонда «Дети Марии»",
    text: "Волонтёры, занятия и собеседования — в одном месте.",
    points: ["Умный поиск волонтёров", "Собеседования и итоги", "Сводка и аналитика"],
  },
  forgot: {
    title: "Секунду — и вы снова с нами",
    text: "Пришлём код на почту, зададите новый пароль — и всё.",
    points: [],
  },
  code: {
    title: "Почти готово!",
    text: "Осталось ввести код из письма.",
    points: [],
  },
};

/** Компьютер: справа — 3D-лента сцен с лендинга, поверх неё карточка «что ждёт после входа»
 *  и два «стикера», которые плавают. Текст карточки меняется вместе с шагом и ролью. */
function Showcase(props: { view: View; role: AccountRole }) {
  const key = props.view === "register" ? props.role : props.view;
  const copy = SHOWCASE[key];
  return (
    <aside className="sticky top-6 hidden h-[min(44rem,calc(100dvh-3rem))] min-h-[32rem] self-start overflow-hidden rounded-[2rem] bg-surface md:block">
      <span aria-hidden="true" className="auth-blob auth-blob-1" />
      <span aria-hidden="true" className="auth-blob auth-blob-2" />
      <span aria-hidden="true" className="auth-blob auth-blob-3" />
      <div className="absolute inset-0">
        <VolunteerScenes fill />
      </div>

      <Sticker className="auth-sticker top-6 left-6" icon="heart" text="Больше 30 лет помогаем" />
      <Sticker className="auth-sticker auth-sticker-2 top-20 right-6" icon="pin" text="Москва, Ярославль, Осетия" />

      <div className="absolute inset-x-5 bottom-5 rounded-3xl bg-page/85 p-6 shadow-[0_24px_50px_-30px_var(--p-ink)] backdrop-blur-md lg:inset-x-8 lg:bottom-8">
        <div key={key} className="auth-stagger flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-accent">
            <Icon name="sparkles" className="size-4" />
            Фонд «Дети Марии»
          </p>
          <p className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">{copy.title}</p>
          <p className="text-lg text-hint">{copy.text}</p>
          {copy.points.length > 0 && (
            <ul className="auth-stagger flex flex-wrap gap-2">
              {copy.points.map((p) => (
                <li key={p} className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-1.5 font-medium">
                  <Icon name="check" className="size-4 text-accent" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

function Sticker(props: { className: string; icon: IconName; text: string }) {
  return (
    <p
      aria-hidden="true"
      className={`absolute z-10 flex items-center gap-2 rounded-full bg-page py-2 pr-4 pl-2 font-semibold shadow-[0_14px_30px_-18px_var(--p-ink)] ${props.className}`}
    >
      <span className="grid size-8 place-items-center rounded-full bg-pop text-ink">
        <Icon name={props.icon} className="size-4" />
      </span>
      {props.text}
    </p>
  );
}

/** Шаг с кодом из письма. Регистрация: набрали шесть цифр — проверяем сразу. Сброс пароля: код и новый пароль. */
function CodeStep(props: {
  sent: CodeSent;
  purpose: "signup" | "reset";
  onBack: () => void;
  onDone: (out: AuthOut) => void;
}) {
  const reset = props.purpose === "reset";
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [wrong, setWrong] = useState(0); // сколько раз ввели неверный код — ячейки вздрагивают
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [resendAt, setResendAt] = useState(() => Date.now() + props.sent.resend_after * 1000);
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (wait === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait]);

  async function check(value: string) {
    setSending(true);
    setError("");
    try {
      const email = props.sent.email;
      props.onDone(reset ? await auth.resetConfirm({ email, code: value, password }) : await auth.verify(email, value));
    } catch (err) {
      setError(errorText(err));
      setCode("");
      setWrong((n) => n + 1);
    } finally {
      setSending(false);
    }
  }

  async function resend() {
    setError("");
    setNote("");
    try {
      const out = reset ? await auth.reset(props.sent.email) : await auth.resend(props.sent.email);
      setResendAt(Date.now() + out.resend_after * 1000);
      setNow(Date.now());
      setNote("Отправили новый код — подойдёт и код из прошлого письма.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  function type(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    // при сбросе ещё нужен новый пароль — ждём кнопку
    if (digits.length === 6 && !sending && !reset) void check(digits);
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">
          {reset ? "Новый пароль" : "Подтвердите почту"}
        </h1>
        <p className="text-hint">
          {reset ? "Если почта" : "Отправили письмо с кодом на"} <b className="text-ink">{props.sent.email}</b>
          {reset ? " зарегистрирована, на неё пришёл код." : "."} Введите 6 цифр из письма. Письма нет — загляните
          в «Спам».
        </p>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length !== 6) {
            setError("В коде 6 цифр");
            return codeRef.current?.focus();
          }
          if (reset && password.length < 6) {
            setError("Новый пароль — хотя бы 6 символов");
            return passwordRef.current?.focus();
          }
          void check(code);
        }}
        className="flex flex-col gap-5"
      >
        <Label text="Код из письма">
          <CodeCells
            inputRef={codeRef}
            invalid={!!error}
            value={code}
            onChange={type}
            busy={sending}
            wrong={wrong}
          />
        </Label>

        {reset && (
          <Label text="Новый пароль" hint="Не меньше 6 символов">
            <PasswordInput inputRef={passwordRef} value={password} onChange={setPassword} autoComplete="new-password" />
          </Label>
        )}

        {error && <ErrorBox id="code-error" text={error} />}
        {note && !error && <p className="rounded-2xl bg-page px-4 py-3">{note}</p>}

        <button
          type="submit"
          disabled={sending}
          {...flairHandlers}
          className={`btn-flair min-h-14 w-full rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] disabled:opacity-60 ${FLAIR.cta}`}
        >
          {sending ? "Проверяем…" : reset ? "Сохранить и войти" : "Подтвердить"}
        </button>
      </form>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5">
        <button
          type="button"
          onClick={resend}
          disabled={wait > 0}
          {...flairHandlers}
          className={`btn-flair min-h-12 rounded-full border-2 border-line bg-page px-6 font-semibold disabled:opacity-60 ${FLAIR.secondary}`}
        >
          {wait > 0 ? `Отправить ещё раз через ${wait} с` : "Отправить код ещё раз"}
        </button>
        <button type="button" onClick={props.onBack} className="min-h-12 px-2 font-semibold text-link underline">
          Изменить почту
        </button>
      </div>
    </>
  );
}

/** «Забыли пароль?» — шаг 1: почта, на неё придёт код. */
function ForgotStep(props: {
  email: string;
  onEmail: (email: string) => void;
  onSent: (sent: CodeSent) => void;
  onBack: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = props.email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError("Похоже на опечатку в почте: нужно вида name@mail.ru");
      return emailRef.current?.focus();
    }
    setSending(true);
    setError("");
    try {
      props.onSent(await auth.reset(clean));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">
          Забыли пароль?
        </h1>
        <p className="text-hint">Введите почту, с которой регистрировались, — пришлём код, чтобы задать новый пароль.</p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Label text="Почта">
          <input
            ref={emailRef}
            aria-invalid={!!error}
            aria-describedby={error ? "forgot-error" : undefined}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={props.email}
            onChange={(e) => props.onEmail(e.target.value)}
            placeholder="name@mail.ru"
            className={inputClass}
          />
        </Label>

        {error && <ErrorBox id="forgot-error" text={error} />}

        <button
          type="submit"
          disabled={sending}
          {...flairHandlers}
          className={`btn-flair min-h-14 w-full rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] disabled:opacity-60 ${FLAIR.cta}`}
        >
          {sending ? "Секунду…" : "Прислать код"}
        </button>

        <p className="text-sm text-hint">
          Письмо не приходит?{" "}
          <a href="https://t.me/DetiMarii_bot" target="_blank" rel="noreferrer" className="font-semibold text-link underline">
            Напишите координатору фонда в Telegram
          </a>
          , он поможет восстановить доступ.
        </p>
      </form>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5">
        <span className="text-hint">Вспомнили пароль?</span>
        <button
          type="button"
          onClick={props.onBack}
          {...flairHandlers}
          className={`btn-flair min-h-12 rounded-full border-2 border-line bg-page px-6 font-semibold ${FLAIR.secondary}`}
        >
          Войти
        </button>
      </div>
    </>
  );
}

/** Поле пароля с кнопкой «Показать». */
function PasswordInput(props: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean; // ошибка в пароле — поле ссылается на текст ошибки (id="auth-error")
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        ref={props.inputRef}
        aria-invalid={props.invalid}
        aria-describedby={props.invalid ? "auth-error" : undefined}
        type={show ? "text" : "password"}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className={`${inputClass} pr-28`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-2 my-auto h-10 rounded-full px-3 text-sm font-semibold text-link hover:bg-surface"
      >
        {show ? "Скрыть" : "Показать"}
      </button>
    </div>
  );
}

/** Поле кода — шесть ячеек. Под ними лежит настоящее прозрачное поле: работают вставка из буфера
 * и подстановка кода из письма на телефоне, а ячейки только показывают цифры. */
function CodeCells(props: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  wrong: number;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean; // ошибка — поле ссылается на её текст (id="code-error")
}) {
  const [focused, setFocused] = useState(true);
  const next = Math.min(props.value.length, 5);
  return (
    <div className="relative">
      {/* key меняется после неверного кода — анимация «вздрагивания» запускается заново */}
      <div key={props.wrong} className={`grid grid-cols-6 gap-2 ${props.wrong ? "code-wrong" : ""}`}>
        {Array.from({ length: 6 }, (_, i) => {
          const digit = props.value[i];
          const active = focused && !props.busy && i === next;
          return (
            <span
              key={i}
              aria-hidden="true"
              style={{ "--i": i } as CSSProperties}
              className={`code-cell${digit ? " is-filled" : ""}${active ? " is-active" : ""}${props.busy ? " is-busy" : ""}`}
            >
              {digit ? <span className="code-digit">{digit}</span> : active && <span className="code-caret" />}
            </span>
          );
        })}
      </div>
      <input
        ref={props.inputRef}
        aria-invalid={props.invalid}
        aria-describedby={props.invalid ? "code-error" : undefined}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        aria-label="Код из письма, 6 цифр"
        className="code-input absolute inset-0 h-full w-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}

function Label(props: { text: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{props.text}</span>
      {props.hint && <span className="text-sm text-hint">{props.hint}</span>}
      {props.children}
    </label>
  );
}
