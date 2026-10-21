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
  if (!r.ok) throw await httpError(r);
  return r.json() as Promise<T>;
}

/** Ошибка с текстом для человека: detail из ответа FastAPI, иначе statusText. */
async function httpError(r: Response): Promise<Error> {
  let detail: unknown = r.statusText;
  try {
    detail = (await r.json()).detail ?? detail;
  } catch {
    /* ответ не JSON — оставляем statusText */
  }
  return new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
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
export type Region = "moscow" | "moscow_region" | "yaroslavl" | "north_ossetia" | "other";
export type Format = "offline" | "online";
export type Regularity = "regular" | "episodic" | "any";
export type ParticipationStatus = "responded" | "invited" | "confirmed" | "attended" | "declined";
export type InterviewStatus = "scheduled" | "done" | "canceled";
export type CallRole = "coordinator" | "volunteer";

export type Answers = {
  about: string;
  skills: string;
  wishes: string;
  experience: string;
  availability: Availability[];
  occupation: Occupation;
  region: Region;
  formats: Format[];
  regularity: Regularity;
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
  format: Format;
  regions: Region[];
};
export type SearchRequest = {
  query: string;
  role_code?: string | null;
  opportunity_id?: number | null;
  statuses?: VolunteerStatus[];
  limit?: number;
};
export type ParsedQuery = {
  skills: string[];
  availability: Availability[];
  kind: Regularity;
  region: Region | null;
  format: Format | null;
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
export type TrainingModule = { id: string; title: string; text: string; required: boolean };
export type Quiz = { module_id: string; questions: { question: string; options: string[] }[] };
export type QuizSubmit = { volunteer_id: number; module_id: string; answers: number[] };
export type QuizResult = {
  score: number;
  passed: boolean;
  correct: boolean[];
  status: VolunteerStatus;
};

export type OpportunityIn = {
  title: string;
  description: string;
  role_code?: string | null;
  starts_at: string;
  region: Region;
  format: Format;
  place: string;
  slots: number;
  hours: number;
};
export type Opportunity = OpportunityIn & {
  id: number;
  taken: number;
  recommended: boolean;
  my_status: ParticipationStatus | null;
};
export type Participation = {
  id: number;
  opportunity_id: number;
  opportunity_title: string;
  volunteer_id: number;
  volunteer_name: string;
  status: ParticipationStatus;
  hours: number;
  created_at: string;
};

export type Decision = "next" | "think" | "reject"; // дальше / подумать / не подходит
export type InterviewResultIn = {
  motivation: number; // 1–5
  readiness: number; // 1–5, готовность к работе с подопечными
  regularity: number; // 1–5, насколько надёжно будет приходить
  decision: Decision;
  roles: string[]; // коды ролей
  comment: string;
};
export type InterviewResult = InterviewResultIn & { created_at: string };
export type Interview = {
  id: number;
  volunteer_id: number;
  starts_at: string;
  status: InterviewStatus;
  token: string; // ссылка на звонок — /call/<token>
  notified: boolean; // ссылка ушла волонтёру в Telegram; false — координатор отправляет её сам
  created_at: string;
  result: InterviewResult | null; // итог после звонка — только для фонда, волонтёру не показываем
};
export type PlanQuestion = { question: string; why: string };
export type InterviewPlan = {
  volunteer_id: number;
  questions: PlanQuestion[];
  focus: string[]; // на что обратить внимание
  ai: boolean; // false — базовый план, LLM недоступен
  created_at: string;
};

// ===== Дашборды кабинета координатора (T-66) =====
export type VolunteerRef = { id: number; name: string };
export type TodayInterview = {
  interview_id: number;
  volunteer: VolunteerRef;
  starts_at: string;
  token: string;
  overdue: boolean; // время прошло, а итога нет
};
export type WaitingVolunteer = {
  volunteer: VolunteerRef;
  since: string;
  days: number;
  training_score: number | null;
};
export type PendingResponse = {
  participation_id: number;
  opportunity_id: number;
  opportunity_title: string;
  starts_at: string;
  volunteer: VolunteerRef;
};
export type Understaffed = {
  opportunity_id: number;
  title: string;
  starts_at: string;
  slots: number;
  taken: number;
  missing: number;
};
export type DashboardToday = {
  interviews: TodayInterview[];
  new_without_interview: WaitingVolunteer[];
  awaiting_approval: WaitingVolunteer[];
  pending_responses: PendingResponse[];
  understaffed: Understaffed[];
  counters: { volunteers: number; active: number; hours_total: number; hours_month: number };
};
export type FunnelStep = "applied" | "interviewed" | "trained" | "approved" | "participated" | "active";
export type FunnelRow = { step: FunnelStep; count: number; by_occupation: Record<Occupation, number> };
export type SupplyRow = { key: Availability | Region | "online"; demand: number; supply: number };
export type WeekRow = { week_start: string; hours: number; participations: number };
export type TopVolunteer = { volunteer: VolunteerRef; hours: number; participations: number };
export type Dormant = { volunteer: VolunteerRef; last_attended: string | null; days: number | null };
export type DashboardAnalytics = {
  funnel: FunnelRow[];
  by_time: SupplyRow[];
  by_region: SupplyRow[];
  weeks: WeekRow[];
  top: TopVolunteer[];
  dormant: Dormant[];
};
export type IceServer = { urls: string[]; username?: string | null; credential?: string | null };
export type CallInfo = { starts_at: string; status: InterviewStatus; ice_servers: IceServer[] };

/** Адрес сигнального WebSocket звонка: тот же бэкенд, что и BASE, но ws:// или wss://. */
export function callSocketUrl(token: string): string {
  const url = new URL(`${BASE}/calls/${encodeURIComponent(token)}/ws`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

async function request<T>(method: "GET" | "PATCH" | "PUT", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (initData) headers["X-Telegram-Init-Data"] = initData;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw await httpError(r);
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
  opportunities: (volunteerId?: number) =>
    request<Opportunity[]>("GET", "/opportunities" + (volunteerId ? `?volunteer_id=${volunteerId}` : "")),
  respond: (opportunityId: number, volunteerId: number) =>
    post<Participation>(`/opportunities/${opportunityId}/respond`, { volunteer_id: volunteerId }),
  myParticipations: (volunteerId: number) =>
    request<Participation[]>("GET", `/volunteers/${volunteerId}/participations`),
  // видеособеседование: список — и для «Я», и для карточки в /admin
  interviews: (volunteerId: number) => request<Interview[]>("GET", `/volunteers/${volunteerId}/interviews`),
  callInfo: (token: string) => request<CallInfo>("GET", `/calls/${encodeURIComponent(token)}`),
  // координатор (/admin)
  createOpportunity: (data: OpportunityIn) => post<Opportunity>("/opportunities", data),
  participants: (opportunityId: number) =>
    request<Participation[]>("GET", `/opportunities/${opportunityId}/participants`),
  invite: (opportunityId: number, volunteerIds: number[]) =>
    post<Participation[]>(`/opportunities/${opportunityId}/invite`, { volunteer_ids: volunteerIds }),
  updateParticipation: (id: number, status: ParticipationStatus) =>
    request<Participation>("PATCH", `/participations/${id}`, { status }),
  search: (data: SearchRequest) => post<SearchResponse>("/search", data),
  list: (status?: VolunteerStatus) =>
    request<Volunteer[]>("GET", "/volunteers" + (status ? `?status=${status}` : "")),
  update: (id: number, data: VolunteerUpdate) =>
    request<Volunteer>("PATCH", `/volunteers/${id}`, data),
  notes: (id: number) => request<Note[]>("GET", `/volunteers/${id}/notes`),
  addNote: (id: number, data: NoteIn) => post<Note>(`/volunteers/${id}/notes`, data),
  scheduleInterview: (volunteerId: number, startsAt: string) =>
    post<Interview>(`/volunteers/${volunteerId}/interviews`, { starts_at: startsAt }),
  updateInterview: (id: number, status: InterviewStatus) =>
    request<Interview>("PATCH", `/interviews/${id}`, { status }),
  interviewPlan: (volunteerId: number, refresh = false) =>
    request<InterviewPlan>(
      "GET",
      `/volunteers/${volunteerId}/interview-plan` + (refresh ? "?refresh=true" : ""),
    ),
  saveInterviewResult: (interviewId: number, data: InterviewResultIn) =>
    request<Interview>("PUT", `/interviews/${interviewId}/result`, data),
  dashboardToday: () => request<DashboardToday>("GET", "/dashboard/today"),
  dashboardAnalytics: () => request<DashboardAnalytics>("GET", "/dashboard/analytics"),
};
