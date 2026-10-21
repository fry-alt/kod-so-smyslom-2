// Единая точка входа к бэкенду для экранов: настоящий API или моки (VITE_MOCK=1).
// Экраны импортируют `backend` и `chatApi` отсюда, а не напрямую из api.ts / mock.ts.
import { api, volunteersApi } from "./api";
import { mockApi, mockChatApi } from "./mock";

export const USE_MOCK = import.meta.env.VITE_MOCK === "1";

export const backend: typeof volunteersApi = USE_MOCK ? mockApi : volunteersApi;

export const chatApi: Pick<typeof api, "chat" | "ask"> = USE_MOCK ? mockChatApi : api;

/** id волонтёра после отправки анкеты (в браузере — localStorage; в Telegram — тоже, по устройству). */
const VOLUNTEER_KEY = "volunteer_id";

export function getVolunteerId(): number | null {
  try {
    const v = Number(localStorage.getItem(VOLUNTEER_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setVolunteerId(id: number | null) {
  try {
    if (id) localStorage.setItem(VOLUNTEER_KEY, String(id));
    else localStorage.removeItem(VOLUNTEER_KEY);
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}
