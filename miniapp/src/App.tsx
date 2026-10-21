// Одно приложение — две части:
//   /        — лендинг; /login — регистрация и вход по почте (волонтёр или координатор)
//   /me      — личный кабинет волонтёра: анкета, путь, занятия, обучение, часы (сайт и Telegram Mini App)
//   /admin   — кабинет фонда (ноутбук, только после входа координатора): сводка, умный поиск, база, аналитика, настройки
// Чтобы добавить экран: компонент в screens/, строка в VOLUNTEER_ROUTES или ADMIN_ROUTES.
import { useEffect, useState, type ReactNode } from "react";

import { backend, getAccount, getVolunteerId, logout, USE_MOCK } from "./backend";
import Footer from "./Footer";
import { UnreadBadge, useUnread } from "./messages/Thread";
import CallScreen from "./call/CallScreen";
import CoordinatorPanel from "./call/CoordinatorPanel";
import { match, navigate, navigateBack, usePath } from "./router";
import { tg } from "./telegram";
import { Button, Link, useLoad } from "./ui";
import Auth from "./screens/Auth";
import Analytics from "./screens/admin/Analytics";
import AdminMessages from "./screens/admin/Messages";
import AdminOpportunities from "./screens/admin/Opportunities";
import OpportunityCard from "./screens/admin/OpportunityCard";
import OpportunityForm from "./screens/admin/OpportunityForm";
import Search from "./screens/admin/Search";
import Settings from "./screens/admin/Settings";
import Summary from "./screens/admin/Summary";
import VolunteerCard from "./screens/admin/VolunteerCard";
import Volunteers from "./screens/admin/Volunteers";
import Ask from "./screens/volunteer/Ask";
import Form from "./screens/volunteer/Form";
import History from "./screens/volunteer/History";
import Interview from "./screens/volunteer/Interview";
import Me from "./screens/volunteer/Me";
import Messages from "./screens/volunteer/Messages";
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
  ["/messages", () => (needsAccount() ? <Auth /> : <Messages />)],
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
  ["/admin/settings", () => <Settings />],
  ["/admin/volunteers", () => <Volunteers />],
  ["/admin/volunteers/:id", (p) => <VolunteerCard id={Number(p.id)} />],
  ["/admin/opportunities", () => <AdminOpportunities />],
  ["/admin/opportunities/new", () => <OpportunityForm />],
  ["/admin/opportunities/:id", (p) => <OpportunityCard id={Number(p.id)} />],
  ["/admin/messages", () => <AdminMessages />],
  ["/admin/messages/:id", (p) => <AdminMessages volunteerId={Number(p.id)} />],
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
  const search = location.search;
  useEffect(() => {
    document.title = `${pageTitle(path, search)} — Дети Марии`;
  }, [path, search]);
  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;
    const goBack = () => navigateBack("/");
    back.onClick(goBack);
    return () => back.offClick(goBack);
  }, []);
  useEffect(() => {
    if (path === "/") tg?.BackButton?.hide();
    else tg?.BackButton?.show();
  }, [path]);
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
  // лендинг, вход, кабинет, занятия, собеседование, анкета, сообщения и «Спросить о фонде» — широкие (колонки на компьютере),
  // остальные — узкие, как в телефоне
  const wide = ["/", "/login", "/me", "/opportunities", "/form", "/interview", "/messages", "/ask"].includes(props.path);
  // анкета — на весь экран и без подвала: ничего не отвлекает от заполнения
  const focus = props.path === "/form";
  const auth = props.path === "/login" || needsAccount() && ["/me", "/form", "/interview", "/messages"].includes(props.path);
  // сообщения — как мессенджер: ровно на высоту экрана, прокручиваются только чаты внутри, подвала нет
  const chat = props.path === "/messages" && !auth;
  return (
    <div
      className={`mx-auto flex flex-col px-4 pt-4 ${chat ? "h-dvh gap-4" : "min-h-screen gap-6"} ${wide ? "max-w-5xl md:px-8 md:pt-6" : "max-w-xl"} ${focus ? "pb-0" : chat ? "pb-4 md:pb-6" : wide ? "pb-24" : "pb-10"}`}
    >
      <header className="flex flex-nowrap items-center justify-between gap-x-3">
        <Logo />
        {!auth && <AccountNav path={props.path} />}
      </header>
      <MockBanner />
      <main className={focus ? "flex flex-1 flex-col" : chat ? "flex min-h-0 flex-1 flex-col" : undefined}>{props.children}</main>
      {/* на странице входа подвала нет — ничего не отвлекает от формы */}
      {!auth && !focus && !chat && <Footer />}
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
        <span className="sm:hidden">Кабинет</span><span className="hidden sm:inline">Личный кабинет</span>
      </Button>
    );
  }
  if (!id || !me) {
    return (
      <Button variant="secondary" onClick={() => navigate("/login?mode=login")}>
        Войти
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-[12rem] truncate font-semibold sm:inline">{me.name.split(" ")[0]}</span>
      <Button variant="secondary" onClick={() => navigate("/me")}>
        <span className="sm:hidden">Кабинет</span><span className="hidden sm:inline">Личный кабинет</span>
      </Button>
    </div>
  );
}

function pageTitle(path: string, search: string): string {
  if (path === "/") return "Волонтёрам";
  if (path === "/form") return "Анкета волонтёра";
  if (path === "/training") return "Обучение";
  if (path === "/me") return "Личный кабинет";
  if (path === "/interview") return "Собеседование";
  if (path === "/messages") return "Сообщения";
  if (path === "/opportunities") return "Занятия и события";
  if (path === "/history") return "Моя история";
  if (path === "/ask") return "Спросить о фонде";
  if (path === "/login") return "Вход и регистрация";
  if (path === "/admin") return new URLSearchParams(search).has("opportunity") ? "Подбор волонтёров" : "Сводка";
  if (path.startsWith("/call/")) return "Видеособеседование";
  if (path.startsWith("/admin/search")) return "Умный поиск";
  if (path.startsWith("/admin/analytics")) return "Аналитика";
  if (path.startsWith("/admin/volunteers/")) return "Карточка волонтёра";
  if (path.startsWith("/admin/volunteers")) return "Волонтёры";
  if (path.startsWith("/admin/opportunities/")) return "Карточка возможности";
  if (path.startsWith("/admin/opportunities")) return "Возможности";
  if (path.startsWith("/admin/messages")) return "Сообщения";
  if (path.startsWith("/admin/settings")) return "Настройки";
  return "Страница не найдена";
}

function AdminLayout(props: { path: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = useUnread(null, "coordinator");
  return (
    <div className="admin min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3 font-semibold">
            <Logo className="h-9 w-auto" />
            <span className="text-hint">кабинет фонда</span>
          </div>
          <nav className="hidden flex-wrap gap-4 md:flex"><AdminLinks path={props.path} unread={unread} /></nav>
          <div className="ml-auto md:hidden">
            <Button variant="secondary" aria-expanded={menuOpen} aria-controls="admin-mobile-menu" onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? "Закрыть" : "Меню"}
            </Button>
          </div>
          <div className="hidden md:block"><CoordinatorMenu /></div>
          {menuOpen && (
            <div id="admin-mobile-menu" className="w-full rounded-2xl border border-line bg-page p-4 md:hidden" onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setMenuOpen(false);
            }}>
              <nav className="flex flex-col gap-4"><AdminLinks path={props.path} unread={unread} /></nav>
              <div className="mt-4 border-t border-line pt-4"><CoordinatorMenu compact /></div>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <MockBanner />
        {props.children}
      </main>
    </div>
  );
}

/** «Сообщения» в меню фонда — со значком новых от волонтёров. */
function MessagesLabel(props: { unread: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      Сообщения <UnreadBadge count={props.unread} />
    </span>
  );
}

/** Справа в шапке кабинета фонда: кто вошёл и «Выйти». */
function CoordinatorMenu(props: { compact?: boolean }) {
  const account = getAccount();
  return (
    <div className={`flex items-center gap-3 ${props.compact ? "justify-between" : "ml-auto"}`}>
      <span className="flex items-center gap-2" title={account?.email}>
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-soft font-display font-semibold uppercase">
          {account?.email[0]}
        </span>
        <span className={`${props.compact ? "max-w-[14rem]" : "hidden max-w-[14rem] lg:inline"} truncate text-hint`}>{account?.email}</span>
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

function AdminLinks(props: { path: string; unread: number }) {
  return <>
    <NavLink to="/admin" path={props.path} exact>Сводка</NavLink>
    <NavLink to="/admin/search" path={props.path}>Умный поиск</NavLink>
    <NavLink to="/admin/volunteers" path={props.path}>База</NavLink>
    <NavLink to="/admin/opportunities" path={props.path}>Возможности</NavLink>
    <NavLink to="/admin/analytics" path={props.path}>Аналитика</NavLink>
    <NavLink to="/admin/messages" path={props.path}><MessagesLabel unread={props.unread} /></NavLink>
    <NavLink to="/admin/settings" path={props.path}>Настройки</NavLink>
  </>;
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
