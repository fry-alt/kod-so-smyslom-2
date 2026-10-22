// Подписи для значений из контракта (api.ts). Все тексты интерфейса для этих полей — только отсюда.
import type {
  AnswerRegularity,
  Availability,
  ContactWay,
  Decision,
  Direction,
  Format,
  FunnelStep,
  Occupation,
  ParticipationStatus,
  Region,
  Regularity,
  SpecialNeeds,
  VolunteerStatus,
} from "./api";

export const AVAILABILITY: Record<Availability, string> = {
  weekday_morning: "Будни, утро",
  weekday_day: "Будни, день",
  weekday_evening: "Будни, вечер",
  weekend: "Выходные",
};

/** Сжимает одинаковые дни, чтобы координатор быстрее прочитал расписание. */
export function formatAvailability(values: Availability[]): string {
  const weekdays = values.filter((value) => value.startsWith("weekday_"));
  const parts: string[] = [];
  if (weekdays.length === 3) parts.push("Будни: утро, день, вечер");
  else parts.push(...weekdays.map((value) => AVAILABILITY[value]));
  if (values.includes("weekend")) parts.push(AVAILABILITY.weekend);
  return parts.join(", ");
}

export const OCCUPATION: Record<Occupation, string> = {
  student: "Студент",
  pensioner: "Пенсионер",
  remote: "Работаю удалённо",
  employed: "Работаю в офисе",
  schoolkid: "Школьник",
  other: "Другое",
};

export const REGION: Record<Region, string> = {
  moscow: "Москва",
  moscow_region: "Московская область",
  yaroslavl: "Ярославская область",
  north_ossetia: "Северная Осетия",
  other: "Другой регион",
};

export const FORMAT: Record<Format, string> = {
  offline: "Очно",
  online: "Онлайн",
};

export const REGULARITY: Record<Regularity, string> = {
  regular: "Постоянно",
  episodic: "Разово",
  any: "Как получится",
};

// Ответы анкеты — дословно как в анкете фонда.
export const ANSWER_REGULARITY: Record<AnswerRegularity, string> = {
  regular: "Хочу участвовать регулярно",
  occasional: "Готов(а) помогать время от времени",
  episodic: "Готов(а) участвовать в отдельных мероприятиях или проектах",
  any: "Пока не знаю — хочу обсудить варианты на встрече",
};

export const DIRECTION: Record<Direction, string> = {
  creative: "Проведение творческих занятий",
  education: "Обучение и образовательные занятия",
  assistant: "Помощь ведущему мастер-класса и ребятам на занятиях",
  psychology: "Психологическая и дефектологическая помощь",
  media: "Фото, медиа и создание контента",
  events: "Помощь в организации событий и мероприятий",
  market: "Помощь интернет-магазину, на маркетах и ярмарках",
  other: "Другое",
  unsure: "Пока не знаю, хочу обсудить варианты на встрече",
};

export const SPECIAL_NEEDS: Record<SpecialNeeds, string> = {
  yes: "Да",
  ready: "Нет, но я готов(а) попробовать",
  discuss: "Нет, хотел(а) бы сначала обсудить это на встрече",
};

export const CONTACT_WAY: Record<ContactWay, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  max: "Max",
  email: "Электронная почта",
  phone: "Телефонный звонок",
};

export const STATUS: Record<VolunteerStatus, string> = {
  new: "Новая анкета",
  training: "Проходит обучение",
  trained: "Обучение пройдено",
  approved: "Допущен",
  active: "Активен",
  paused: "На паузе",
};

/** Цвет метки статуса — CSS-переменные --status-* из index.css, у каждого этапа свой оттенок. */
export const STATUS_COLOR: Record<VolunteerStatus, string> = {
  new: "bg-[var(--status-new)] text-[var(--status-new-ink)]",
  training: "bg-[var(--status-training)] text-[var(--status-training-ink)]",
  trained: "bg-[var(--status-trained)] text-[var(--status-trained-ink)]",
  approved: "bg-[var(--status-approved)] text-[var(--status-approved-ink)]",
  active: "bg-[var(--status-active)] text-[var(--status-active-ink)]",
  paused: "bg-[var(--status-paused)] text-[var(--status-paused-ink)]",
};

/** Номер этапа на пути волонтёра (1–5) — в метке статуса рядом с названием. У паузы номера нет. */
export const STATUS_STEP: Partial<Record<VolunteerStatus, number>> = {
  new: 1,
  training: 2,
  trained: 3,
  approved: 4,
  active: 5,
};

export const PARTICIPATION: Record<ParticipationStatus, string> = {
  responded: "Откликнулся",
  invited: "Приглашён",
  confirmed: "Подтвердил",
  attended: "Участвовал",
  declined: "Отказ",
};

/** Цвет метки статуса участия (классы Tailwind). */
export const PARTICIPATION_COLOR: Record<ParticipationStatus, string> = {
  responded: "bg-sky-100 text-sky-900",
  invited: "bg-amber-100 text-amber-900",
  confirmed: "bg-green-100 text-green-900",
  attended: "bg-emerald-200 text-emerald-950",
  declined: "bg-gray-200 text-gray-700",
};

export const DECISION: Record<Decision, string> = {
  next: "Дальше",
  think: "Подумать",
  reject: "Не подходит",
};

/** Шаги воронки волонтёров на «Аналитике». */
export const FUNNEL_STEP: Record<FunnelStep, string> = {
  applied: "Анкета",
  interviewed: "Собеседование",
  trained: "Обучение пройдено",
  approved: "Допущен",
  participated: "Первое участие",
  active: "Активен (60 дней)",
};
