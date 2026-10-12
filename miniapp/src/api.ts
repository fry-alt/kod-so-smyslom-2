// Клиент к бэкенду. Типы повторяют backend/app/schemas.py — меняйте их вместе.
import { initData } from "./telegram";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatResponse = { answer: string; provider: string; model: string };
export type Source = { source: string; chunk: number; score: number; text: string };
export type AskResponse = { answer: string; found: boolean; sources: Source[] };

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (initData) headers["X-Telegram-Init-Data"] = initData;

  const r = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) {
    let detail: unknown = r.statusText;
    try {
      detail = (await r.json()).detail ?? detail;
    } catch {
      /* ответ не JSON — оставляем statusText */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return r.json() as Promise<T>;
}

export const api = {
  chat: (message: string, history: ChatMessage[]) =>
    post<ChatResponse>("/chat", { message, history, channel: "miniapp" }),
  ask: (question: string) => post<AskResponse>("/documents/ask", { question, channel: "miniapp" }),
};
