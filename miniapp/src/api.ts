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

// ===== Умный поиск волонтёров — повторяет backend/app/schemas.py =====
// Имя, контакт и telegram_id в LLM не уходят — только answers и profile.

export type Availability = "weekday_morning" | "weekday_day" | "weekday_evening" | "weekend";
export type Occupation = "student" | "pensioner" | "remote" | "employed" | "schoolkid" | "other";
export type VolunteerStatus = "new" | "training" | "trained" | "approved" | "active" | "paused";
export type RoleKind = "regular" | "episodic";

export type Answers = {
  about: string;
  skills: string;
  wishes: string;
  experience: string;
  availability: Availability[];
  occupation: Occupation;
};
export type Profile = {
  skills: string[];
  interests: string[];
  suitable_roles: string[];
  summary: string;
};
export type VolunteerIn = {
  name: string;
  contact: string;
  telegram_id?: number | null;
  answers: Answers;
};
export type Volunteer = VolunteerIn & {
  id: number;
  profile: Profile | null;
  status: VolunteerStatus;
  training_score: number | null;
  hours: number;
  created_at: string;
};
export type VolunteerUpdate = { status?: VolunteerStatus; hours?: number };
export type NoteIn = { text: string; author?: string };
export type Note = Required<NoteIn> & { id: number; volunteer_id: number; created_at: string };
export type Role = {
  code: string;
  title: string;
  description: string;
  skills: string[];
  availability: Availability[];
  kind: RoleKind;
};
export type SearchRequest = {
  query: string;
  role_code?: string | null;
  statuses?: VolunteerStatus[];
  limit?: number;
};
export type ParsedQuery = {
  skills: string[];
  availability: Availability[];
  kind: RoleKind | "any";
  notes: string;
};
export type Candidate = {
  volunteer: Volunteer;
  score: number;
  reason: string;
  matched_skills: string[];
  ai: boolean;
};
export type SearchResponse = { parsed: ParsedQuery; candidates: Candidate[]; total_checked: number };
export type TrainingModule = { id: string; title: string; text: string };
export type Quiz = { module_id: string; questions: { question: string; options: string[] }[] };
export type QuizSubmit = { volunteer_id: number; module_id: string; answers: number[] };
export type QuizResult = {
  score: number;
  passed: boolean;
  correct: boolean[];
  status: VolunteerStatus;
};

async function request<T>(method: "GET" | "PATCH", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (initData) headers["X-Telegram-Init-Data"] = initData;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json() as Promise<T>;
}

export const volunteersApi = {
  // волонтёр
  submit: (data: VolunteerIn) => post<Volunteer>("/volunteers", data),
  get: (id: number) => request<Volunteer>("GET", `/volunteers/${id}`),
  roles: () => request<Role[]>("GET", "/roles"),
  training: () => request<TrainingModule[]>("GET", "/training"),
  quiz: (moduleId: string) => request<Quiz>("GET", `/training/${moduleId}/quiz`),
  submitQuiz: (data: QuizSubmit) => post<QuizResult>("/training/submit", data),
  // координатор (/admin)
  search: (data: SearchRequest) => post<SearchResponse>("/search", data),
  list: (status?: VolunteerStatus) =>
    request<Volunteer[]>("GET", "/volunteers" + (status ? `?status=${status}` : "")),
  update: (id: number, data: VolunteerUpdate) =>
    request<Volunteer>("PATCH", `/volunteers/${id}`, data),
  notes: (id: number) => request<Note[]>("GET", `/volunteers/${id}/notes`),
  addNote: (id: number, data: NoteIn) => post<Note>(`/volunteers/${id}/notes`, data),
};
