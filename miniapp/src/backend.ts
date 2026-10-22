// Единая точка входа к бэкенду для экранов: настоящий API или моки (VITE_MOCK=1).
// Экраны импортируют `backend` и `chatApi` отсюда, а не напрямую из api.ts / mock.ts.
import { api, authApi, TOKEN_KEY, volunteersApi, type Account, type AuthOut, type Look } from "./api";
import { mockApi, mockAuthApi, mockChatApi } from "./mock";

export const USE_MOCK = import.meta.env.VITE_MOCK === "1";

export const backend: typeof volunteersApi = USE_MOCK ? mockApi : volunteersApi;

export const chatApi: Pick<typeof api, "chat"> = USE_MOCK ? mockChatApi : api;

export const auth: typeof authApi = USE_MOCK ? mockAuthApi : authApi;

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

// ===== Вход по почте и паролю =====
// Ключ входа (TOKEN_KEY) api.ts кладёт в заголовок Authorization. Аккаунт запоминаем рядом,
// чтобы шапка сразу знала, кто вошёл; свежие данные — auth.me().
const ACCOUNT_KEY = "account";

export function getAccount(): Account | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ? (JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? "null") as Account | null) : null;
  } catch {
    return null;
  }
}

/** Как показывать, кто вошёл: имя, а у старых аккаунтов без имени — почту. */
export function accountName(account: Account | null): string {
  return account?.name?.trim() || account?.email || "";
}

/** После регистрации или входа: запомнить аккаунт; если анкета уже заполнена — открыть её кабинет. */
export function saveSession(out: AuthOut) {
  try {
    localStorage.setItem(TOKEN_KEY, out.token);
  } catch {
    /* приватный режим */
  }
  saveAccount(out.account);
}

export function saveAccount(account: Account) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* приватный режим */
  }
  if (account.role === "volunteer") setVolunteerId(account.volunteer_id);
}

/** Выйти: забыть аккаунт и анкету на этом устройстве. */
export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    localStorage.removeItem(LOOK_KEY);
  } catch {
    /* приватный режим */
  }
  setVolunteerId(null);
}

// ===== Оформление кабинета =====
// С аккаунтом — хранится на сервере (одинаково на телефоне и компьютере), копия — в localStorage,
// чтобы шапка рисовалась сразу. Без аккаунта (вошли из Telegram) — только на этом устройстве.
const LOOK_KEY = "look";

export const DEFAULT_LOOK: Look = { avatar: "", color: "blue", cover: "sky", stickers: [], nickname: "" };

export function getLook(): Look {
  try {
    return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(LOOK_KEY) ?? "{}") };
  } catch {
    return DEFAULT_LOOK;
  }
}

function keepLook(look: Look): Look {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    /* приватный режим */
  }
  return look;
}

export async function loadLook(): Promise<Look> {
  return getAccount() ? keepLook(await auth.look()) : getLook();
}

export async function saveLook(look: Look): Promise<Look> {
  return keepLook(getAccount() ? await auth.saveLook(look) : look);
}
