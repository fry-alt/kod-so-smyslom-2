// Маршрутизация без библиотек: текущий путь — location.pathname, переход — history.pushState.
// Кнопки «назад/вперёд» браузера работают через событие popstate.
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** Текущий путь без завершающего слеша: "/", "/admin", "/admin/volunteers/3". */
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname.replace(/(.)\/+$/, "$1"));
}

/** Параметры адреса: /admin?opportunity=3 → useSearchParam("opportunity") === "3". */
export function useSearchParam(name: string): string | null {
  const search = useSyncExternalStore(subscribe, () => location.search);
  return new URLSearchParams(search).get(name);
}

export function navigate(path: string) {
  if (path === location.pathname + location.search) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

/** Сопоставить путь с шаблоном вида "/admin/volunteers/:id". Вернёт параметры или null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/");
  const s = path.split("/");
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
