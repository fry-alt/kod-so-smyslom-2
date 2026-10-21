// Одно приложение — две части:
//   /        — волонтёр (сайт и Telegram Mini App): приветствие → анкета → обучение → статус
//   /admin   — кабинет фонда (ноутбук): умный поиск, база, карточка, возможности
// Чтобы добавить экран: компонент в screens/, строка в VOLUNTEER_ROUTES или ADMIN_ROUTES.
import type { ReactNode } from "react";

import { getVolunteerId, USE_MOCK } from "./backend";
import CallScreen from "./call/CallScreen";
import { match, usePath } from "./router";
import { Link } from "./ui";
import AdminOpportunities from "./screens/admin/Opportunities";
import OpportunityCard from "./screens/admin/OpportunityCard";
import OpportunityForm from "./screens/admin/OpportunityForm";
import Search from "./screens/admin/Search";
import VolunteerCard from "./screens/admin/VolunteerCard";
import Volunteers from "./screens/admin/Volunteers";
import Ask from "./screens/volunteer/Ask";
import Form from "./screens/volunteer/Form";
import History from "./screens/volunteer/History";
import Me from "./screens/volunteer/Me";
import Opportunities from "./screens/volunteer/Opportunities";
import Training from "./screens/volunteer/Training";
import Welcome from "./screens/volunteer/Welcome";

type Route = [pattern: string, render: (params: Record<string, string>) => ReactNode];

const VOLUNTEER_ROUTES: Route[] = [
  // повторный заход: анкета уже отправлена — сразу статус
  ["/", () => (getVolunteerId() ? <Me /> : <Welcome />)],
  ["/form", () => <Form />],
  ["/training", () => <Training />],
  ["/me", () => <Me />],
  ["/opportunities", () => <Opportunities />],
  ["/history", () => <History />],
  ["/ask", () => <Ask />],
];

const ADMIN_ROUTES: Route[] = [
  ["/admin", () => <Search />],
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
  if (call) return <CallScreen token={call.token} />;
  if (path === "/admin" || path.startsWith("/admin/")) {
    return <AdminLayout path={path}>{render(ADMIN_ROUTES, path) ?? <NotFound home="/admin" />}</AdminLayout>;
  }
  return <VolunteerLayout path={path}>{render(VOLUNTEER_ROUTES, path) ?? <NotFound home="/" />}</VolunteerLayout>;
}

function VolunteerLayout(props: { path: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 pt-4 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Link to="/" className="font-bold whitespace-nowrap">
          🧡 Дети Марии
        </Link>
        <nav className="flex gap-4 whitespace-nowrap">
          <NavLink to="/opportunities" path={props.path}>
            Куда пойти
          </NavLink>
          <NavLink to="/me" path={props.path}>
            Мой статус
          </NavLink>
        </nav>
      </header>
      <MockBanner />
      <main>{props.children}</main>
    </div>
  );
}

function AdminLayout(props: { path: string; children: ReactNode }) {
  return (
    <div className="admin min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/admin" className="font-bold">
            🧡 Дети Марии · кабинет фонда
          </Link>
          <nav className="flex flex-wrap gap-4">
            <NavLink to="/admin" path={props.path} exact>
              Умный поиск
            </NavLink>
            <NavLink to="/admin/volunteers" path={props.path}>
              База
            </NavLink>
            <NavLink to="/admin/opportunities" path={props.path}>
              Возможности
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <MockBanner />
        {props.children}
      </main>
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
