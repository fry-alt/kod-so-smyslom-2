// Подписи для значений из контракта (api.ts). Все тексты интерфейса для этих полей — только отсюда.
import type {
  Availability,
  Format,
  Occupation,
  ParticipationStatus,
  Region,
  Regularity,
  VolunteerStatus,
} from "./api";

export const AVAILABILITY: Record<Availability, string> = {
  weekday_morning: "Будни, утро",
  weekday_day: "Будни, день",
  weekday_evening: "Будни, вечер",
  weekend: "Выходные",
};

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

export const STATUS: Record<VolunteerStatus, string> = {
  new: "Новая анкета",
  training: "Проходит обучение",
  trained: "Обучение пройдено",
  approved: "Допущен",
  active: "Активен",
  paused: "На паузе",
};

/** Цвет метки статуса (классы Tailwind). */
export const STATUS_COLOR: Record<VolunteerStatus, string> = {
  new: "bg-sky-100 text-sky-900",
  training: "bg-amber-100 text-amber-900",
  trained: "bg-lime-100 text-lime-900",
  approved: "bg-green-100 text-green-900",
  active: "bg-emerald-200 text-emerald-950",
  paused: "bg-gray-200 text-gray-700",
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
