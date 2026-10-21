// Меню кабинета фонда — плавающая панель-«док»: иконки с подписями, при наведении мышью
// иконка под курсором и соседние плавно увеличиваются (как док в macOS). Без сторонних библиотек:
// pointermove → целевой масштаб по расстоянию до курсора → requestAnimationFrame подтягивает CSS-переменную --s.
// На телефоне, при сенсорном вводе и при «уменьшить движение» увеличения нет — обычная панель с прокруткой.
import { useEffect, useRef, type ReactNode } from "react";

import { UnreadBadge, useUnread } from "./messages/Thread";
import { Link } from "./ui";

type Item = { to: string; label: string; exact?: boolean; icon: ReactNode };

const ITEMS: Item[] = [
  {
    to: "/admin",
    label: "Сводка",
    exact: true,
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </Icon>
    ),
  },
  {
    to: "/admin/search",
    label: "Умный поиск",
    icon: (
      <Icon>
        <circle cx="10.5" cy="10.5" r="7" />
        <path d="m21 21-5.5-5.5" />
        <path d="M10.5 7.2 11.4 9.6 13.8 10.5 11.4 11.4 10.5 13.8 9.6 11.4 7.2 10.5 9.6 9.6Z" />
      </Icon>
    ),
  },
  {
    to: "/admin/volunteers",
    label: "База",
    icon: (
      <Icon>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </Icon>
    ),
  },
  {
    to: "/admin/opportunities",
    label: "Возможности",
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="m9 16 2 2 4-4" />
      </Icon>
    ),
  },
  {
    to: "/admin/analytics",
    label: "Аналитика",
    icon: (
      <Icon>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </Icon>
    ),
  },
  {
    to: "/admin/messages",
    label: "Сообщения",
    icon: (
      <Icon>
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </Icon>
    ),
  },
  {
    to: "/admin/settings",
    label: "Настройки",
    icon: (
      <Icon>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </Icon>
    ),
  },
];

/** Насколько вырастает иконка прямо под курсором и на каком расстоянии (px) эффект сходит на нет. */
const MAX_SCALE = 1.5;
const RANGE = 150;
const MAGNIFY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (min-width: 641px)";

export default function AdminDock(props: { path: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const unread = useUnread(null, "coordinator");
  useMagnify(listRef);

  // на узком экране панель прокручивается — показываем открытый раздел
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(".is-active")?.parentElement;
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2, behavior: calm ? "auto" : "smooth" });
  }, [props.path]);

  return (
    <nav aria-label="Разделы кабинета" className="dock-wrap">
      <ul ref={listRef} className="dock">
        {ITEMS.map((item) => {
          const active = item.exact ? props.path === item.to : props.path.startsWith(item.to);
          return (
            <li key={item.to} className="dock-item">
              <Link to={item.to} current={active} className={active ? "dock-link is-active" : "dock-link"}>
                <span className="dock-icon">
                  {item.icon}
                  {item.to === "/admin/messages" && unread > 0 && (
                    <span className="dock-badge">
                      <UnreadBadge count={unread} />
                    </span>
                  )}
                </span>
                <span className="dock-label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Увеличение иконок по расстоянию до курсора: масштаб плавно догоняет цель каждый кадр, пока не догонит. */
function useMagnify(ref: { current: HTMLUListElement | null }) {
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const can = matchMedia(MAGNIFY);
    const items = Array.from(list.querySelectorAll<HTMLElement>(".dock-item"));
    const scale = items.map(() => 1);
    const target = items.map(() => 1);
    let centers: number[] = [];
    let frame = 0;

    const tick = () => {
      let moving = false;
      items.forEach((el, i) => {
        const next = scale[i] + (target[i] - scale[i]) * 0.22;
        scale[i] = Math.abs(target[i] - next) < 0.002 ? target[i] : next;
        if (scale[i] !== target[i]) moving = true;
        el.style.setProperty("--s", scale[i].toFixed(3));
      });
      frame = moving ? requestAnimationFrame(tick) : 0;
    };
    const run = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // центры пунктов по горизонтали; сами пункты не двигаются (растёт только иконка через transform)
    const onEnter = () => {
      centers = items.map((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !can.matches) return;
      if (!centers.length) onEnter();
      centers.forEach((c, i) => {
        const t = Math.max(0, 1 - Math.abs(e.clientX - c) / RANGE);
        target[i] = 1 + (MAX_SCALE - 1) * t * t * (3 - 2 * t);
      });
      run();
    };
    const onLeave = () => {
      centers = [];
      target.fill(1);
      run();
    };

    list.addEventListener("pointerenter", onEnter);
    list.addEventListener("pointermove", onMove);
    list.addEventListener("pointerleave", onLeave);
    return () => {
      list.removeEventListener("pointerenter", onEnter);
      list.removeEventListener("pointermove", onMove);
      list.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/** Линейная иконка в духе Lucide: 24×24, одна толщина линии. */
function Icon(props: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}
