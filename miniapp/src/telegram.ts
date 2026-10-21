// Минимальная типизация Telegram WebApp SDK — только то, что используем.
// Полное API: https://core.telegram.org/bots/webapps

type TelegramUser = { id: number; first_name: string; last_name?: string; username?: string };

type TelegramWebApp = {
  initData: string; // подписанная строка — отправляем на бэкенд для проверки
  initDataUnsafe: { user?: TelegramUser }; // НЕ проверено — только для отображения
  ready(): void;
  expand(): void;
  themeParams?: Partial<Record<"bg_color" | "secondary_bg_color" | "text_color" | "hint_color" | "link_color" | "button_color" | "button_text_color", string>>;
  onEvent?(event: "themeChanged", callback: () => void): void;
  offEvent?(event: "themeChanged", callback: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  BackButton?: { show(): void; hide(): void; onClick(callback: () => void): void; offClick(callback: () => void): void };
  openLink?(url: string): void; // открыть ссылку во внешнем браузере
  HapticFeedback?: { impactOccurred(style: "light" | "medium" | "heavy"): void };
};

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

/** Пусто, если страница открыта не из Telegram (например, в обычном браузере при разработке). */
export const initData = tg?.initData ?? "";

export const tgUser = tg?.initDataUnsafe.user;

export function initTelegram() {
  tg?.ready();
  tg?.expand();
  if (!tg) return;
  const applyTheme = () => {
    const colors = tg.themeParams;
    const root = document.documentElement.style;
    const variables: Record<string, string | undefined> = {
      "--p-page": colors?.bg_color,
      "--p-surface": colors?.secondary_bg_color,
      "--p-ink": colors?.text_color,
      "--p-hint": colors?.hint_color,
      "--p-accent": colors?.button_color ?? colors?.link_color,
      "--p-cta": colors?.button_color,
      "--p-accent-text": colors?.button_text_color,
    };
    for (const [name, value] of Object.entries(variables)) {
      if (value && /^#[\da-f]{6}$/i.test(value)) root.setProperty(name, value);
    }
    if (colors?.bg_color && /^#[\da-f]{6}$/i.test(colors.bg_color)) {
      tg.setHeaderColor?.(colors.bg_color);
      tg.setBackgroundColor?.(colors.bg_color);
    }
  };
  applyTheme();
  tg.onEvent?.("themeChanged", applyTheme);
}
