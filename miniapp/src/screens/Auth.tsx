// Регистрация и вход по почте и паролю — одна страница для волонтёра и координатора фонда.
// Регистрация в два шага: форма → код из письма (CodeStep) → кабинет. Если почта на сервере не настроена,
// бэкенд регистрирует сразу, без кода. «Забыли пароль?»: почта (ForgotStep) → код и новый пароль (CodeStep).
// После входа: волонтёр — в личный кабинет (/me), координатор — в кабинет фонда (/admin).
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type Ref } from "react";

import type { AccountRole, AuthOut, CodeSent } from "../api";
import { auth, saveSession } from "../backend";
import { FUND_DOCS } from "../Footer";
import { Icon, type IconName } from "../icons";
import { navigate } from "../router";
import { tg } from "../telegram";
import { ErrorBox, errorText, FLAIR, flairHandlers, inputClass } from "../ui";

type Mode = "register" | "login";

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
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const register = mode === "register";

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
    if (register && !cleanName) return setError("Напишите, как вас зовут");
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
      if ("pending" in out) setSent(out);
      else enter(out);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  function fail(field: "email" | "password", text: string) {
    setError(text);
    setBadField(field);
    (field === "email" ? emailRef : passwordRef).current?.focus();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setBadField(null);
  }

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[26rem]">
      <section className="flex min-w-0 flex-col gap-6 rounded-[2rem] bg-surface p-5 shadow-[0_24px_60px_-40px_var(--p-ink)] sm:p-7">
        {sent ? (
          <CodeStep
            sent={sent}
            purpose={forgot ? "reset" : "signup"}
            onBack={() => setSent(null)}
            onDone={enter}
          />
        ) : forgot ? (
          <ForgotStep email={email} onEmail={setEmail} onSent={setSent} onBack={() => setForgot(false)} />
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

            <form onSubmit={submit} noValidate className="flex flex-col gap-5">
              {register && <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-semibold">Зарегистрироваться как</legend>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  {(Object.keys(ROLE) as AccountRole[]).map((r) => {
                    const on = role === r;
                    return (
                      <label
                        key={r}
                        className={`relative flex cursor-pointer flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition select-none ${
                          on ? "border-accent bg-page shadow-sm" : "border-transparent bg-page/60 hover:border-line"
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
                        <Icon name={ROLE[r].icon} className="size-7 text-accent" />
                        <span className="leading-tight font-semibold">{ROLE[r].title}</span>
                        <span className="text-sm leading-tight text-hint">{ROLE[r].sub}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>}

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

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5">
              <span className="text-hint">{register ? "Уже есть аккаунт?" : "Ещё нет аккаунта?"}</span>
              <button
                type="button"
                onClick={() => switchMode(register ? "login" : "register")}
                {...flairHandlers}
                className={`btn-flair min-h-12 rounded-full border-2 border-line bg-page px-6 font-semibold ${FLAIR.secondary}`}
              >
                {register ? "Войти" : "Зарегистрироваться"}
              </button>
            </div>

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
      </section>

    </div>
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
