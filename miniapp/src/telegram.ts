// Минимальная типизация Telegram WebApp SDK — только то, что используем.
// Полное API: https://core.telegram.org/bots/webapps

type TelegramUser = { id: number; first_name: string; last_name?: string; username?: string };

type TelegramWebApp = {
  initData: string; // подписанная строка — отправляем на бэкенд для проверки
  initDataUnsafe: { user?: TelegramUser }; // НЕ проверено — только для отображения
  ready(): void;
  expand(): void;
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
}
