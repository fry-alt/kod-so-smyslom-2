// Регистрация и вход по почте и паролю — одна страница для волонтёра и координатора фонда.
// Слева (на телефоне — сверху) форма, справа — живые сцены «что делают волонтёры», как на лендинге.
// После входа: волонтёр — в личный кабинет (/me), координатор — в кабинет фонда (/admin).
import { useState, type FormEvent, type ReactNode } from "react";

import type { AccountRole } from "../api";
import { auth, saveSession } from "../backend";
import { FUND_DOCS } from "../Footer";
import { navigate } from "../router";
import { tg } from "../telegram";
import { ErrorBox, errorText, FLAIR, flairHandlers, inputClass } from "../ui";
import VolunteerScenes from "./volunteer/VolunteerScenes";

type Mode = "register" | "login";

const ROLE: Record<AccountRole, { title: string; sub: string; icon: string }> = {
  volunteer: { title: "Я волонтёр", sub: "хочу помогать фонду", icon: "🙋" },
  coordinator: { title: "Я координатор", sub: "работаю в фонде", icon: "🏠" },
};

export default function Auth(props: { mode?: Mode; role?: AccountRole }) {
  const [mode, setMode] = useState<Mode>(props.mode ?? "register");
  const [role, setRole] = useState<AccountRole>(props.role ?? "volunteer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const register = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return setError("Похоже на опечатку в почте: нужно вида name@mail.ru");
    if (register && password.length < 6) return setError("Пароль — хотя бы 6 символов");
    if (!password) return setError("Введите пароль");
    setSending(true);
    setError("");
    try {
      const out = register
        ? await auth.register({ email: clean, password, role, code: code.trim() })
        : await auth.login({ email: clean, password, role });
      saveSession(out);
      navigate(out.account.role === "coordinator" ? "/admin" : "/me");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-10 lg:gap-14">
      <section className="flex flex-col gap-6 rounded-[2rem] bg-surface p-5 shadow-[0_24px_60px_-40px_var(--p-ink)] sm:p-7">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">
            {register ? "Регистрация" : role === "coordinator" ? "Вход в кабинет фонда" : "Вход в личный кабинет"}
          </h1>
          <p className="text-hint">
            {register
              ? "Почта и пароль — и сразу откроется личный кабинет."
              : "Введите почту и пароль, с которыми регистрировались."}
          </p>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">{register ? "Зарегистрироваться как" : "Войти как"}</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(Object.keys(ROLE) as AccountRole[]).map((r) => {
                const on = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setRole(r);
                      setError("");
                    }}
                    className={`flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition ${
                      on ? "border-accent bg-page shadow-sm" : "border-transparent bg-page/60 hover:border-line"
                    }`}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {ROLE[r].icon}
                    </span>
                    <span className="leading-tight font-semibold">{ROLE[r].title}</span>
                    <span className="text-sm leading-tight text-hint">{ROLE[r].sub}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Label text="Почта">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@mail.ru"
              className={inputClass}
            />
          </Label>

          <Label text="Пароль" hint={register ? "Не меньше 6 символов" : undefined}>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-28`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-2 my-auto h-10 rounded-full px-3 text-sm font-semibold text-link hover:bg-surface"
              >
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>
          </Label>

          {register && role === "coordinator" && (
            <Label text="Код фонда" hint="Его выдаёт руководитель фонда — чтобы в кабинет фонда не попали посторонние">
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" className={inputClass} />
            </Label>
          )}

          {error && <ErrorBox text={error} />}

          <button
            type="submit"
            disabled={sending}
            {...flairHandlers}
            className={`btn-flair min-h-14 w-full rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] disabled:opacity-60 ${FLAIR.cta}`}
          >
            {sending ? "Секунду…" : register ? "Зарегистрироваться" : "Войти"}
          </button>

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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5">
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
      </section>

      <Showcase role={role} />
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

/** Правая часть: что ждёт после входа — и сцены с лендинга, они двигаются. */
function Showcase(props: { role: AccountRole }) {
  const points =
    props.role === "volunteer"
      ? ["Занятия, куда можно пойти", "Обучение и тест", "Ваши часы и путь в фонде"]
      : ["Умный поиск волонтёров", "Собеседования и итоги", "Сводка и аналитика"];
  return (
    <section className="auth-showcase relative flex flex-col gap-6 overflow-hidden rounded-[2rem] bg-soft p-5 sm:p-7">
      <span aria-hidden="true" className="auth-blob auth-blob-1" />
      <span aria-hidden="true" className="auth-blob auth-blob-2" />
      <span aria-hidden="true" className="auth-blob auth-blob-3" />
      <div className="relative flex flex-col gap-3">
        <p className="font-display text-2xl leading-tight font-semibold text-balance md:text-[2rem]">
          {props.role === "volunteer" ? "Творческие мастерские ждут вас" : "Кабинет фонда «Дети Марии»"}
        </p>
        <ul className="flex flex-wrap gap-2">
          {points.map((p) => (
            <li key={p} className="rounded-full bg-page/80 px-4 py-1.5 font-medium backdrop-blur-sm">
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative">
        <VolunteerScenes />
      </div>
    </section>
  );
}
