// Одно приложение — две части:
//   /        — лендинг; /login — регистрация и вход по почте (волонтёр или координатор)
//   /me      — личный кабинет волонтёра: анкета, путь, занятия, обучение, часы (сайт и Telegram Mini App)
//   /admin   — кабинет фонда (ноутбук, только после входа координатора): сводка, умный поиск, база, аналитика
// Чтобы добавить экран: компонент в screens/, строка в VOLUNTEER_ROUTES или ADMIN_ROUTES.
import type { ReactNode } from "react";

import { backend, getAccount, getVolunteerId, logout, USE_MOCK } from "./backend";
import Footer from "./Footer";
import CallScreen from "./call/CallScreen";
import CoordinatorPanel from "./call/CoordinatorPanel";
import { match, navigate, usePath } from "./router";
import { tg } from "./telegram";
import { Button, Link, useLoad } from "./ui";
import Auth from "./screens/Auth";
import Analytics from "./screens/admin/Analytics";
import AdminOpportunities from "./screens/admin/Opportunities";
import OpportunityCard from "./screens/admin/OpportunityCard";
import OpportunityForm from "./screens/admin/OpportunityForm";
import Search from "./screens/admin/Search";
import Summary from "./screens/admin/Summary";
import VolunteerCard from "./screens/admin/VolunteerCard";
import Volunteers from "./screens/admin/Volunteers";
import Ask from "./screens/volunteer/Ask";
import Form from "./screens/volunteer/Form";
import History from "./screens/volunteer/History";
import Interview from "./screens/volunteer/Interview";
import Me from "./screens/volunteer/Me";
import Opportunities from "./screens/volunteer/Opportunities";
import Training from "./screens/volunteer/Training";
import Welcome from "./screens/volunteer/Welcome";

type Route = [pattern: string, render: (params: Record<string, string>) => ReactNode];

/** Анкета и кабинет — после регистрации. В Telegram Mini App можно и без неё: человека узнаём по Telegram. */
const needsAccount = () => !getAccount() && !getVolunteerId() && !tg?.initData;

const VOLUNTEER_ROUTES: Route[] = [
  ["/", () => <Welcome />],
  ["/form", () => (needsAccount() ? <Auth /> : <Form />)],
  ["/training", () => <Training />],
  ["/me", () => (needsAccount() ? <Auth /> : <Me />)],
  ["/interview", () => (needsAccount() ? <Auth /> : <Interview />)],
  ["/login", () => <Auth mode={new URLSearchParams(location.search).get("mode") === "login" ? "login" : "register"} />],
  ["/opportunities", () => <Opportunities />],
  ["/history", () => <History />],
  ["/ask", () => <Ask />],
];

const ADMIN_ROUTES: Route[] = [
  // старые ссылки на подбор под возможность (/admin?opportunity=3) по-прежнему открывают поиск
  ["/admin", () => (new URLSearchParams(location.search).has("opportunity") ? <Search /> : <Summary />)],
  ["/admin/search", () => <Search />],
  ["/admin/analytics", () => <Analytics />],
  ["/admin/volunteers", () => <Volunteers />],
  ["/admin/volunteers/:id", (p) => <VolunteerCard id={Number(p.id)} />],
  ["/admin/opportunities", () => <AdminOpportunities />],
  ["/admin/opportunities/new", () => <OpportunityForm />],
  ["/admin/opportunities/:id", (p) => <OpportunityCard id={Number(p.id)} />],
];

function render(routes: Route[], path: string): ReactNode {
  for (const [pattern, screen] of routes) {
    const params = match(pattern, path);
    if (params) return screen(params);
  }
  return null;
}

export default function App() {
  const path = usePath();
  // видеособеседование — на весь экран, без меню (ссылку открывают и волонтёр, и координатор)
  const call = match("/call/:token", path);
  if (call) {
    // ссылка из кабинета несёт id собеседования и волонтёра — тогда у координатора есть панель «План / Итог»
    const q = new URLSearchParams(location.search);
    const interviewId = Number(q.get("interview"));
    const volunteerId = Number(q.get("volunteer"));
    const panel =
      interviewId > 0 && volunteerId > 0
        ? (ended: boolean) => <CoordinatorPanel interviewId={interviewId} volunteerId={volunteerId} ended={ended} />
        : undefined;
    return <CallScreen token={call.token} sidePanel={panel} />;
  }
  if (path === "/admin" || path.startsWith("/admin/")) {
    // кабинет фонда — только координатору; остальным — вход с выбранной ролью «координатор»
    if (getAccount()?.role !== "coordinator") {
      return (
        <VolunteerLayout path="/login">
          <Auth mode="login" role="coordinator" />
        </VolunteerLayout>
      );
    }
    return <AdminLayout path={path}>{render(ADMIN_ROUTES, path) ?? <NotFound home="/admin" />}</AdminLayout>;
  }
  return <VolunteerLayout path={path}>{render(VOLUNTEER_ROUTES, path) ?? <NotFound home="/" />}</VolunteerLayout>;
}

function VolunteerLayout(props: { path: string; children: ReactNode }) {
  // лендинг, вход, кабинет, занятия, собеседование и анкета — широкие (колонки на компьютере), остальные — узкие, как в телефоне
  const wide = ["/", "/login", "/me", "/opportunities", "/form", "/interview"].includes(props.path);
  // анкета — на весь экран и без подвала: ничего не отвлекает от заполнения
  const focus = props.path === "/form";
  const auth = props.path === "/login" || needsAccount() && ["/me", "/form", "/interview"].includes(props.path);
  return (
    <div className={`mx-auto flex min-h-screen flex-col gap-6 px-4 pt-4 ${wide ? "max-w-5xl md:px-8 md:pt-6" : "max-w-xl"} ${focus ? "pb-0" : wide ? "pb-24" : "pb-10"}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Logo />
        {!auth && <AccountNav path={props.path} />}
      </header>
      <MockBanner />
      <main className={focus ? "flex flex-1 flex-col" : undefined}>{props.children}</main>
      {/* на странице входа подвала нет — ничего не отвлекает от формы */}
      {!auth && !focus && <Footer />}
    </div>
  );
}

/** Логотип всегда ведёт на лендинг — и с сайта, и из кабинета фонда. */
function Logo(props: { className?: string }) {
  return (
    <Link to="/" className="flex shrink-0 items-center">
      <img src="/logo.svg" alt="Дети Марии — на главную" className={props.className ?? "h-9 w-auto md:h-11"} />
    </Link>
  );
}

/** Справа в шапке: «Войти» — или имя и вход в свой кабинет (волонтёра или фонда). */
function AccountNav(props: { path: string }) {
  const account = getAccount();
  const id = getVolunteerId();
  const { data: me } = useLoad(() => (id ? backend.get(id) : Promise.resolve(null)), [id]);
  // в самом кабинете шапка пустая: «Выйти из кабинета» — внизу, под разделами
  if (account && props.path === "/me") return null;
  if (account?.role === "coordinator") {
    return (
      <Button variant="secondary" onClick={() => navigate("/admin")}>
        Кабинет фонда
      </Button>
    );
  }
  if (account && !me) {
    return (
      <Button variant="secondary" onClick={() => navigate("/me")}>
        Личный кабинет
      </Button>
    );
  }
  if (!id || !me) {
    return (
      <Button variant="secondary" onClick={() => navigate("/login")}>
        Войти
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-[12rem] truncate font-semibold sm:inline">{me.name.split(" ")[0]}</span>
      <Button variant="secondary" onClick={() => navigate("/me")}>
        Личный кабинет
      </Button>
    </div>
  );
}

function AdminLayout(props: { path: string; children: ReactNode }) {
  return (
    <div className="admin min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3 font-semibold">
            <Logo className="h-9 w-auto" />
            <span className="text-hint">кабинет фонда</span>
          </div>
          <nav className="flex flex-wrap gap-4">
            <NavLink to="/admin" path={props.path} exact>
              Сводка
            </NavLink>
            <NavLink to="/admin/search" path={props.path}>
              Умный поиск
            </NavLink>
            <NavLink to="/admin/volunteers" path={props.path}>
              База
            </NavLink>
            <NavLink to="/admin/opportunities" path={props.path}>
              Возможности
            </NavLink>
            <NavLink to="/admin/analytics" path={props.path}>
              Аналитика
            </NavLink>
          </nav>
          <CoordinatorMenu />
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <MockBanner />
        {props.children}
      </main>
    </div>
  );
}

/** Справа в шапке кабинета фонда: кто вошёл и «Выйти». */
function CoordinatorMenu() {
  const account = getAccount();
  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="flex items-center gap-2" title={account?.email}>
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-soft font-display font-semibold uppercase">
          {account?.email[0]}
        </span>
        <span className="hidden max-w-[14rem] truncate text-hint lg:inline">{account?.email}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          logout();
          navigate("/");
        }}
        className="min-h-10 rounded-full border-2 border-line px-4 font-semibold hover:border-accent"
      >
        Выйти
      </button>
    </div>
  );
}

function NavLink(props: { to: string; path: string; exact?: boolean; children: ReactNode }) {
  const active = props.exact ? props.path === props.to : props.path.startsWith(props.to);
  return (
    <Link
      to={props.to}
      className={active ? "font-semibold text-ink underline decoration-accent decoration-2 underline-offset-8" : "text-hint hover:text-ink"}
    >
      {props.children}
    </Link>
  );
}

function MockBanner() {
  if (!USE_MOCK) return null;
  return (
    <p className="rounded-2xl bg-amber-100 px-4 py-2 text-sm text-amber-900">
      Демо-режим: данные вымышленные, бэкенд не используется (VITE_MOCK=1).
    </p>
  );
}

function NotFound(props: { home: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold">Страница не найдена</h1>
      <Link to={props.home}>На главную</Link>
    </div>
  );
}
