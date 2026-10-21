// Моки бэкенда по контракту из api.ts — чтобы интерфейс работал без бэкенда.
// Включаются переменной VITE_MOCK=1 (см. backend.ts). Данные вымышленные и живут в памяти вкладки;
// волонтёры дополнительно сохраняются в localStorage, чтобы после перезагрузки работал «Мой статус».
// Сбросить демо-данные: localStorage.removeItem("mock_volunteers").
import type {
  Account,
  Look,
  AskResponse,
  AuthOut,
  Availability,
  Candidate,
  CallInfo,
  ChatResponse,
  DashboardAnalytics,
  DashboardToday,
  DialogSummary,
  Interview,
  InterviewPlan,
  InterviewSlots,
  Message,
  Note,
  Opportunity,
  OpportunityIn,
  Participation,
  ParticipationStatus,
  ParsedQuery,
  PlanQuestion,
  Quiz,
  QuizResult,
  Region,
  Regularity,
  Role,
  SearchRequest,
  SearchResponse,
  Sender,
  TrainingModule,
  Volunteer,
  VolunteerIn,
  authApi,
  volunteersApi,
} from "./api";
import { TOKEN_KEY } from "./api";

/** Имитация задержки сети/LLM, чтобы были видны состояния загрузки. */
const wait = <T>(value: T, ms = 400): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

const notFound = (what: string) => Promise.reject(new Error(`${what} не найден(а)`));

const roles: Role[] = [
  {
    code: "creative_lead",
    title: "Ведущий творческих занятий",
    description: "Проводит занятие по керамике, живописи, валянию или шитью для группы участников.",
    skills: ["керамика", "живопись", "валяние", "шитьё", "педагогика"],
    availability: ["weekday_morning", "weekday_day", "weekend"],
    kind: "regular",
    format: "offline",
    regions: ["moscow"],
  },
  {
    code: "workshop_assistant",
    title: "Помощник на мастер-классе",
    description: "Помогает ведущему и ребятам на занятии: материалы, внимание каждому участнику.",
    skills: ["терпение", "работа с детьми", "творчество"],
    availability: ["weekday_morning", "weekday_day", "weekend"],
    kind: "regular",
    format: "offline",
    regions: ["moscow", "moscow_region", "yaroslavl", "north_ossetia"],
  },
  {
    code: "photo_media",
    title: "Фото, видео и контент",
    description: "Снимает занятия и события, делает посты для соцсетей фонда.",
    skills: ["фотография", "видеосъёмка", "соцсети", "монтаж"],
    availability: ["weekday_day", "weekend"],
    kind: "episodic",
    format: "offline",
    regions: ["moscow"],
  },
  {
    code: "events",
    title: "Организация событий",
    description: "Помогает готовить и проводить маркеты, ярмарки и праздники фонда.",
    skills: ["организация мероприятий", "общение", "логистика"],
    availability: ["weekday_evening", "weekend"],
    kind: "episodic",
    format: "offline",
    regions: ["moscow", "moscow_region"],
  },
  {
    code: "shop_market",
    title: "Интернет-магазин и маркеты",
    description: "Помогает с карточками товаров, продажами на маркетах и упаковкой работ мастерских.",
    skills: ["продажи", "фотография", "тексты"],
    availability: ["weekday_evening", "weekend"],
    kind: "episodic",
    format: "online",
    regions: ["moscow", "moscow_region", "yaroslavl", "north_ossetia", "other"],
  },
  {
    code: "psy_support",
    title: "Психологическая и дефектологическая помощь",
    description: "Специалист сопровождает участников с ментальными особенностями на занятиях.",
    skills: ["психология", "дефектология", "работа с особыми детьми"],
    availability: ["weekday_morning", "weekday_day"],
    kind: "regular",
    format: "offline",
    regions: ["moscow", "yaroslavl"],
  },
];

const SAVE_KEY = "mock_volunteers";
const volunteers: Volunteer[] = loadSaved() ?? [
  vol(1, "Анна Ковалёва", "@anna_k", "pensioner", ["weekday_morning", "weekday_day"], "moscow", "regular",
    "Бывший преподаватель ИЗО, 30 лет в школе.", "живопись, рисование, педагогика",
    ["живопись", "педагогика"], ["creative_lead"], "trained", 90, 12),
  vol(2, "Илья Смирнов", "+7 900 000-00-02", "student", ["weekday_evening", "weekend"], "moscow", "episodic",
    "Учусь на журналиста, снимаю на беззеркалку.", "фотография, видеосъёмка, монтаж",
    ["фотография", "видеосъёмка", "монтаж"], ["photo_media"], "approved", 85, 6),
  vol(3, "Мария Орлова", "@m_orlova", "remote", ["weekday_day"], "moscow", "regular",
    "Работаю удалённо дизайнером, люблю керамику.", "керамика, лепка, дизайн",
    ["керамика", "дизайн"], ["creative_lead", "workshop_assistant"], "active", 100, 40),
  vol(4, "Дмитрий Волков", "@dvolkov", "employed", ["weekend"], "moscow_region", "episodic",
    "Организую корпоративы, могу помочь с ярмаркой.", "организация мероприятий, логистика",
    ["организация мероприятий", "логистика"], ["events"], "new", null, 0),
  vol(5, "Елена Петрова", "+7 900 000-00-05", "pensioner", ["weekday_morning"], "yaroslavl", "regular",
    "Шью и вяжу, хочу учить этому детей.", "шитьё, вязание, валяние",
    ["шитьё", "валяние"], ["creative_lead"], "training", null, 0),
  vol(6, "Софья Лебедева", "@sonya_leb", "student", ["weekday_day", "weekday_evening"], "moscow", "regular",
    "Учусь на дефектолога, практика в коррекционной школе.", "дефектология, работа с особыми детьми",
    ["дефектология", "работа с особыми детьми"], ["psy_support", "workshop_assistant"], "trained", 80, 3),
  vol(7, "Артём Ким", "@artem_kim", "schoolkid", ["weekend"], "moscow", "episodic",
    "Нужны волонтёрские часы, могу помочь на маркете.", "общение, продажи",
    ["продажи"], ["shop_market", "events"], "new", null, 0),
  vol(8, "Ольга Зайцева", "@olga_z", "remote", ["weekday_morning", "weekday_day", "weekday_evening"], "north_ossetia", "any",
    "Маркетолог, веду соцсети небольших брендов.", "соцсети, тексты, фотография",
    ["соцсети", "тексты", "фотография"], ["photo_media", "shop_market"], "approved", 75, 8),
  vol(9, "Николай Фёдоров", "+7 900 000-00-09", "pensioner", ["weekday_day"], "moscow", "regular",
    "Инженер на пенсии, хорошо лажу с подростками.", "терпение, столярка, работа с детьми",
    ["терпение", "работа с детьми"], ["workshop_assistant"], "paused", 70, 20),
  vol(10, "Вера Соколова", "@vera_psy", "employed", ["weekday_morning"], "moscow", "regular",
    "Клинический психолог, свободна по утрам в будни.", "психология, арт-терапия",
    ["психология", "арт-терапия"], ["psy_support"], "active", 95, 30),
];

let nextVolunteerId = Math.max(...volunteers.map((v) => v.id)) + 1;

function loadSaved(): Volunteer[] | null {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(volunteers));
  } catch {
    /* приватный режим — живём в памяти */
  }
}

function vol(
  id: number, name: string, contact: string, occupation: Volunteer["answers"]["occupation"],
  availability: Availability[], region: Region, regularity: Regularity,
  about: string, skills: string, tags: string[], suitable_roles: string[],
  status: Volunteer["status"], training_score: number | null, hours: number,
): Volunteer {
  return {
    id, name, contact, telegram_id: null, status, training_score, hours,
    created_at: `2026-10-${String(10 + (id % 10)).padStart(2, "0")}T12:00:00`,
    answers: {
      about, skills, wishes: "Хочу быть полезным подопечным фонда.", experience: "",
      availability, occupation, region, formats: ["offline"], regularity,
    },
    profile: { skills: tags, interests: [], suitable_roles, summary: about },
  };
}

const notes: Note[] = [
  { id: 1, volunteer_id: 3, text: "Провела 4 занятия по керамике, участники в восторге.", author: "Координатор", created_at: "2026-10-18T15:00:00" },
];

// Модули — как data/training/*.md на бэкенде (id = имя файла), тексты сокращены.
const modules: TrainingModule[] = [
  { id: "01-about", title: "О фонде «Дети Марии»", required: true,
    text: `## Кто мы

Фонд «Дети Марии» работает больше 30 лет. Он вырос из волонтёрской инициативы,
и волонтёры до сих пор — **сердце фонда**.

## Кому мы помогаем

- детям-сиротам и выпускникам детских домов;
- детям и взрослым с ментальными особенностями;
- молодым людям, которые растут вне семьи.

## Как стать волонтёром

1. Анкета — расскажите о себе.
2. Обучение — прочитайте материалы и пройдите короткий тест.
3. Координатор пригласит на подходящее занятие.` },
  { id: "02-wards", title: "Наши подопечные и как с ними общаться", required: true,
    text: `## Главные правила общения

**Обращайтесь к человеку, а не к сопровождающему.** Говорите с ним самим, по имени.

**Говорите просто и спокойно.** Короткие фразы, одна просьба за раз.

**Дайте время.** Не делайте за человека то, что он может сделать сам.

**Не обещайте того, чего не сможете выполнить.** Для ребят из детских домов это особенно важно.` },
  { id: "03-safety", title: "Безопасность на мастерской", required: true,
    text: `## Перед занятием

- Приходите за 15 минут.
- Узнайте, где аптечка и запасной выход.
- Заболели — не приходите и предупредите координатора.

## Если что-то случилось

1. Сохраняйте спокойствие.
2. Сразу позовите педагога или координатора.
3. Если человеку плохо — звоните **112**.` },
  { id: "04-mentoring", title: "Как стать значимым взрослым", required: false,
    text: `> Дополнительный модуль: для допуска не обязателен.

Значимый взрослый — тот, кто приходит **регулярно** и держит слово. Доверие строится месяцами.` },
];

// Вопросы теста; на бэкенде их сочиняет LLM по тексту модуля.
const quizzes: Record<string, { questions: Quiz["questions"]; right: number[] }> = {
  "01-about": {
    questions: [
      { question: "Кому помогает фонд?", options: ["Только пожилым людям", "Детям-сиротам и людям с ментальными особенностями", "Бездомным животным"] },
      { question: "Что идёт после анкеты?", options: ["Сразу занятие", "Обучение и короткий тест", "Собеседование в офисе"] },
      { question: "Сколько лет работает фонд?", options: ["Больше 30 лет", "Около года", "5 лет"] },
    ],
    right: [1, 1, 0],
  },
  "02-wards": {
    questions: [
      { question: "К кому обращаться на занятии?", options: ["К сопровождающему", "К самому человеку, по имени", "Лучше молчать"] },
      { question: "Участник долго не справляется с заданием. Что делать?", options: ["Сразу сделать за него", "Дать время и спросить: «Помочь?»", "Пересадить к другому"] },
      { question: "Можно ли обещать прийти, если не уверены?", options: ["Да, это подбадривает", "Нет, обещайте только то, что выполните", "Можно, если потом извиниться"] },
    ],
    right: [1, 1, 1],
  },
  "03-safety": {
    questions: [
      { question: "За сколько минут лучше прийти на занятие?", options: ["Ровно к началу", "За 15 минут", "За час"] },
      { question: "Вы заболели накануне занятия. Как поступить?", options: ["Прийти в маске", "Не приходить и предупредить координатора", "Ничего не говорить"] },
      { question: "Человеку стало плохо. Куда звонить?", options: ["112", "Родственникам волонтёра", "Никуда, подождать"] },
    ],
    right: [1, 1, 0],
  },
  "04-mentoring": {
    questions: [
      { question: "Что важнее всего для значимого взрослого?", options: ["Дорогие подарки", "Приходить регулярно и держать слово", "Строгость"] },
    ],
    right: [1],
  },
};

/** Лучший балл волонтёра по каждому модулю — чтобы статус считался по всем обязательным. */
const quizScores: Record<number, Record<string, number>> = {};

// Возможности и участия тоже сохраняются в localStorage: путь «пригласить в /admin → подтвердить у волонтёра»
// проходит через перезагрузку страницы или две вкладки. Сбросить: localStorage.removeItem("mock_opportunities"),
// localStorage.removeItem("mock_participations").
const OPP_KEY = "mock_opportunities";
const PART_KEY = "mock_participations";
const INTERVIEW_KEY = "mock_interviews";

const opportunities: Omit<Opportunity, "taken" | "recommended" | "my_status">[] = [
  { id: 1, title: "Керамика с группой из интерната", description: "Помочь ведущему на занятии по керамике.",
    role_code: "workshop_assistant", starts_at: "2026-10-23T10:00:00", region: "moscow", format: "offline",
    place: "Мастерские, Дмитровский пер., 4", slots: 3, hours: 3 },
  { id: 2, title: "Фотосъёмка «Арт-субботы»", description: "Отснять занятие и работы участников.",
    role_code: "photo_media", starts_at: "2026-10-25T11:00:00", region: "moscow", format: "offline",
    place: "Студия, Новинский б-р, 25", slots: 1, hours: 4 },
  { id: 3, title: "Карточки товаров для магазина", description: "Описать 10 работ мастерских для интернет-магазина.",
    role_code: "shop_market", starts_at: "2026-10-27T18:00:00", region: "other", format: "online",
    place: "Онлайн", slots: 2, hours: 2 },
];

const participations: Participation[] = [
  { id: 1, opportunity_id: 1, opportunity_title: "", volunteer_id: 3, volunteer_name: "", status: "confirmed", hours: 0, created_at: "2026-10-20T10:00:00" },
  { id: 2, opportunity_id: 2, opportunity_title: "", volunteer_id: 2, volunteer_name: "", status: "invited", hours: 0, created_at: "2026-10-20T11:00:00" },
];

/** Местное время без часового пояса, как у бэкенда: сегодня + days, в hour:00. */
function dayAt(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00:00`;
}

// Видеособеседования. Сам звонок на моках не работает — ему нужен сигнальный сервер бэкенда.
const interviews: Interview[] = [
  { id: 1, volunteer_id: 1, starts_at: dayAt(0, 15), status: "scheduled", token: "demo-call-token",
    notified: true, created_at: dayAt(-1, 12), result: null },
  { id: 2, volunteer_id: 7, starts_at: dayAt(-1, 16), status: "scheduled", token: "demo-call-late",
    notified: false, created_at: dayAt(-3, 12), result: null },
  { id: 3, volunteer_id: 3, starts_at: dayAt(-20, 12), status: "done", token: "demo-call-done",
    notified: true, created_at: dayAt(-22, 12),
    result: { motivation: 5, readiness: 5, regularity: 4, decision: "next", roles: ["workshop_assistant"],
      comment: "Сама ведёт керамику, готова к постоянной группе.", created_at: dayAt(-20, 13) } },
];

/** Перечитать сохранённое: другая вкладка могла пригласить, подтвердить или отправить анкету. */
function refresh() {
  try {
    const replace = <T>(list: T[], key: string) => {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as T[] | null;
      if (saved) list.splice(0, list.length, ...saved);
    };
    replace(opportunities, OPP_KEY);
    replace(participations, PART_KEY);
    replace(interviews, INTERVIEW_KEY);
    replace(volunteers, SAVE_KEY);
  } catch {
    /* приватный режим — живём в памяти */
  }
}

function saveOpportunities() {
  try {
    localStorage.setItem(OPP_KEY, JSON.stringify(opportunities));
    localStorage.setItem(PART_KEY, JSON.stringify(participations));
    localStorage.setItem(INTERVIEW_KEY, JSON.stringify(interviews));
  } catch {
    /* приватный режим — живём в памяти */
  }
}

refresh();

const nextId = (list: { id: number }[]) => Math.max(0, ...list.map((x) => x.id)) + 1;

/** Отклик или приглашение: повторно запись не создаём, отказ можно «оживить». */
function participate(opportunityId: number, volunteerId: number, status: "responded" | "invited"): Participation {
  let p = participations.find((x) => x.opportunity_id === opportunityId && x.volunteer_id === volunteerId);
  if (p) {
    if (p.status === "declined") p.status = status;
  } else {
    p = {
      id: nextId(participations), opportunity_id: opportunityId, opportunity_title: "", volunteer_id: volunteerId,
      volunteer_name: "", status, hours: 0, created_at: new Date().toISOString(),
    };
    participations.push(p);
  }
  return withNames(p);
}

const findVolunteer = (id: number) => volunteers.find((v) => v.id === id);

function withNames(p: Participation): Participation {
  return {
    ...p,
    opportunity_title: opportunities.find((o) => o.id === p.opportunity_id)?.title ?? "",
    volunteer_name: findVolunteer(p.volunteer_id)?.name ?? "",
  };
}

function opportunityOut(o: (typeof opportunities)[number], volunteerId?: number): Opportunity {
  const ps = participations.filter((p) => p.opportunity_id === o.id && p.status !== "declined");
  const v = volunteerId ? findVolunteer(volunteerId) : undefined;
  return {
    ...o,
    taken: ps.filter((p) => p.status === "confirmed" || p.status === "attended").length,
    recommended: !!v && !!o.role_code && !!v.profile?.suitable_roles.includes(o.role_code),
    my_status: ps.find((p) => p.volunteer_id === volunteerId)?.status ?? null,
  };
}

// ===== «Умный поиск» на ключевых словах — грубая имитация того, что делает бэкенд =====

const TIME_WORDS: [RegExp, Availability[]][] = [
  [/утр/i, ["weekday_morning"]],
  [/днём|днем|день/i, ["weekday_day"]],
  [/вечер/i, ["weekday_evening"]],
  [/суббот|воскрес|выходн/i, ["weekend"]],
  [/понедельник|вторник|сред|четверг|пятниц|будн/i, ["weekday_morning", "weekday_day"]],
];
const REGION_WORDS: [RegExp, Region][] = [
  [/ярослав/i, "yaroslavl"],
  [/осет|владикавказ/i, "north_ossetia"],
  [/област|подмосков/i, "moscow_region"],
  [/москв/i, "moscow"],
];

function parseQuery(query: string): ParsedQuery {
  const q = query.toLowerCase();
  const allSkills = [...new Set(volunteers.flatMap((v) => v.profile?.skills ?? []))];
  const stem = (w: string) => w.slice(0, Math.max(4, w.length - 3));
  // навык «работа с детьми» совпадает, только если в тексте есть все его значимые слова
  const skills = allSkills.filter((s) =>
    s.split(" ").filter((w) => w.length > 2).every((w) => q.includes(stem(w))),
  );
  if (/фотограф|съёмк|съемк|снять|отснять/.test(q) && !skills.includes("фотография")) skills.push("фотография");
  const availability = [...new Set(TIME_WORDS.filter(([re]) => re.test(q)).flatMap(([, a]) => a))];
  // «четверг утром» — только будни утро, а не весь будний день
  const narrowed = availability.includes("weekday_morning") && /утр/.test(q)
    ? availability.filter((a) => a !== "weekday_day" || /днём|днем|день/.test(q))
    : availability;
  const kind: Regularity = /разов|один раз|разово/.test(q) ? "episodic" : /постоян|регуляр|каждую/.test(q) ? "regular" : "any";
  return {
    skills,
    availability: narrowed,
    kind,
    region: REGION_WORDS.find(([re]) => re.test(q))?.[1] ?? null,
    format: /онлайн|удалённ|удаленн/.test(q) ? "online" : /очно/.test(q) ? "offline" : null,
    notes: "",
  };
}

function search(req: SearchRequest): SearchResponse {
  const { statuses, limit = 10 } = req;
  let query = req.query;
  let roleCode = req.role_code;
  // подбор под возможность: запрос строим из её полей, как бэкенд
  const opp = opportunities.find((o) => o.id === req.opportunity_id);
  if (opp) {
    query = `${opp.title} ${opp.description} ${query}`;
    roleCode = roleCode ?? opp.role_code;
  }
  const role = roles.find((r) => r.code === roleCode);
  const parsed = parseQuery(query + (role ? " " + role.skills.join(" ") : ""));
  if (opp) {
    parsed.region = opp.format === "online" ? null : opp.region;
    parsed.format = opp.format;
  }
  const pool = volunteers.filter(
    (v) => v.status !== "paused" && (!statuses?.length || statuses.includes(v.status)),
  );
  const candidates: Candidate[] = pool
    .map((v) => {
      const tags = v.profile?.skills ?? [];
      const matched = tags.filter((t) => parsed.skills.includes(t));
      const timeOk = !parsed.availability.length || parsed.availability.some((a) => v.answers.availability.includes(a));
      const regionOk = !parsed.region || v.answers.region === parsed.region;
      let score = 30 + matched.length * 30 + (timeOk ? 20 : -30) + (regionOk ? 10 : -20);
      if (role && v.profile?.suitable_roles.includes(role.code)) score += 20;
      score = Math.max(0, Math.min(100, score));
      const reason = matched.length
        ? `Умеет: ${matched.join(", ")}.${timeOk ? " Свободен в нужное время." : " Но время не совпадает."}`
        : timeOk ? "Свободен в нужное время, навыки напрямую не совпадают." : "Слабое совпадение.";
      return { volunteer: v, score, reason, matched_skills: matched, ai: true };
    })
    .filter((c) => c.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { parsed, candidates, total_checked: pool.length };
}

// ===== То же API, что volunteersApi в api.ts =====

// ===== План собеседования: те же правила, что фолбэк на бэкенде (services/interview_plan.py) =====

const BASE_PLAN: PlanQuestion[] = [
  { question: "Почему вы хотите помогать именно нашему фонду?", why: "Понять мотивацию" },
  { question: "Был ли у вас опыт общения с детьми или взрослыми с особенностями развития?",
    why: "Готовность к работе с подопечными" },
  { question: "Что вы сделаете, если на занятии станет тяжело или непонятно, как себя вести?",
    why: "Как человек справляется с трудными ситуациями" },
  { question: "Как часто у вас реально получится приходить?", why: "Сверить ожидания по регулярности" },
];

function interviewPlan(v: Volunteer): InterviewPlan {
  const questions = [...BASE_PLAN];
  const focus: string[] = [];
  if (v.answers.occupation === "schoolkid") {
    questions.push({ question: "Нужны ли вам часы или баллы для школы? Сколько занятий планируете?",
      why: "Школьники часто приходят ради баллов и пропадают" });
    focus.push("Школьник — проверить, готов ли прийти больше одного раза");
  }
  if (!v.answers.experience.trim()) {
    questions.push({ question: "Как вы представляете занятие с особыми ребятами?", why: "Опыта в анкете нет" });
    focus.push("Нет опыта — рассказать, как проходят занятия");
  }
  if (v.answers.occupation === "pensioner") {
    questions.push({ question: "Удобно ли вам добираться? Сколько времени комфортно провести на занятии?",
      why: "Силы и дорога — частые причины пропусков" });
  }
  return { volunteer_id: v.id, questions, focus, ai: true, created_at: new Date().toISOString() };
}

// ===== Переписка фонда с волонтёром (T-100) =====
// Хранится в localStorage (mock_messages), чтобы в двух вкладках — /admin и /me — шёл один диалог.
// Сбросить: localStorage.removeItem("mock_messages").
const MESSAGES_KEY = "mock_messages";
type MockMessage = Message & { volunteer_id: number };
type MockDialogs = { messages: MockMessage[]; read: Record<number, Record<Sender, number>> };

function loadDialogs(): MockDialogs {
  try {
    const saved = JSON.parse(localStorage.getItem(MESSAGES_KEY) ?? "null") as MockDialogs | null;
    if (saved) return saved;
  } catch {
    /* приватный режим — демо-переписка */
  }
  const msg = (id: number, sender: Sender, text: string, daysAgo: number, opportunity_id: number | null = null): MockMessage => ({
    id, volunteer_id: 3, sender, text, opportunity_id, opportunity_title: null,
    created_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
  });
  return {
    messages: [
      msg(1, "coordinator", "Мария, добро пожаловать в фонд! Если появятся вопросы о волонтёрстве — пишите сюда, отвечу.", 3),
      msg(2, "coordinator", "Мария, здравствуйте! Спасибо, что записались на керамику. Сможете прийти на 15 минут раньше — помочь разложить глину?", 1, 1),
      msg(3, "volunteer", "Здравствуйте! Да, конечно, приду к 9:45.", 0.5, 1),
    ],
    read: { 3: { coordinator: 2, volunteer: 3 } },
  };
}

function saveDialogs(d: MockDialogs) {
  try {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(d));
  } catch {
    /* приватный режим — живём в памяти вкладки */
  }
}

function messageOut(m: MockMessage): Message {
  const { volunteer_id: _, ...rest } = m;
  return { ...rest, opportunity_title: opportunities.find((o) => o.id === m.opportunity_id)?.title ?? null };
}

function unreadFor(d: MockDialogs, volunteerId: number, reader: Sender): number {
  const seen = d.read[volunteerId]?.[reader] ?? 0;
  return d.messages.filter((m) => m.volunteer_id === volunteerId && m.sender !== reader && m.id > seen).length;
}

function setRead(d: MockDialogs, volunteerId: number, reader: Sender, id: number) {
  d.read[volunteerId] = { ...(d.read[volunteerId] ?? { coordinator: 0, volunteer: 0 }), [reader]: id };
}

function lastId(d: MockDialogs, volunteerId: number): number {
  return Math.max(0, ...d.messages.filter((m) => m.volunteer_id === volunteerId).map((m) => m.id));
}

// ===== Дашборды. «Сегодня» считаем из моков, аналитику — заготовкой (у моков слишком мало истории) =====

const DAY = 86_400_000;

function dashboardToday(): DashboardToday {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const ref = (id: number) => ({ id, name: findVolunteer(id)?.name ?? "" });
  const days = (iso: string) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
  const booked = new Set(interviews.filter((i) => i.status !== "canceled").map((i) => i.volunteer_id));
  const upcoming = opportunities
    .filter((o) => new Date(o.starts_at) >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return {
    interviews: interviews
      .filter((i) => i.status === "scheduled" && new Date(i.starts_at) <= endOfDay)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((i) => ({ interview_id: i.id, volunteer: ref(i.volunteer_id), starts_at: i.starts_at, token: i.token,
        overdue: new Date(i.starts_at) < now })),
    new_without_interview: volunteers
      .filter((v) => v.status === "new" && !booked.has(v.id))
      .map((v) => ({ volunteer: ref(v.id), since: v.created_at, days: days(v.created_at), training_score: null })),
    awaiting_approval: volunteers
      .filter((v) => v.status === "trained")
      .map((v) => ({ volunteer: ref(v.id), since: v.created_at, days: days(v.created_at),
        training_score: v.training_score })),
    pending_responses: upcoming.flatMap((o) =>
      participations
        .filter((p) => p.opportunity_id === o.id && p.status === "responded")
        .map((p) => ({ participation_id: p.id, opportunity_id: o.id, opportunity_title: o.title,
          starts_at: o.starts_at, volunteer: ref(p.volunteer_id) })),
    ),
    understaffed: upcoming
      .filter((o) => new Date(o.starts_at).getTime() <= now.getTime() + 7 * DAY)
      .map((o) => opportunityOut(o))
      .filter((o) => o.taken < o.slots)
      .map((o) => ({ opportunity_id: o.id, title: o.title, starts_at: o.starts_at, slots: o.slots, taken: o.taken,
        missing: o.slots - o.taken })),
    counters: {
      volunteers: volunteers.length,
      active: volunteers.filter((v) => v.status === "active").length,
      hours_total: volunteers.reduce((sum, v) => sum + v.hours, 0),
      hours_month: 14,
    },
  };
}

/** Аналитика-заготовка: отвал школьников, дефицит «будни утром», неровная активность. */
function dashboardAnalytics(): DashboardAnalytics {
  const occ = (student: number, pensioner: number, remote: number, employed: number, schoolkid: number, other = 0) =>
    ({ student, pensioner, remote, employed, schoolkid, other });
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const hours = [6, 9, 3, 12, 8, 0, 10, 15, 7, 11, 18, 9];
  return {
    funnel: [
      { step: "applied", count: 40, by_occupation: occ(15, 10, 8, 4, 3) },
      { step: "interviewed", count: 27, by_occupation: occ(10, 9, 6, 1, 1) },
      { step: "trained", count: 21, by_occupation: occ(7, 8, 5, 1, 0) },
      { step: "approved", count: 17, by_occupation: occ(5, 7, 4, 1, 0) },
      { step: "participated", count: 13, by_occupation: occ(3, 6, 3, 1, 0) },
      { step: "active", count: 9, by_occupation: occ(2, 5, 2, 0, 0) },
    ],
    by_time: [
      { key: "weekday_morning", demand: 9, supply: 4 },
      { key: "weekday_day", demand: 6, supply: 5 },
      { key: "weekday_evening", demand: 2, supply: 7 },
      { key: "weekend", demand: 7, supply: 11 },
    ],
    by_region: [
      { key: "moscow", demand: 14, supply: 12 },
      { key: "moscow_region", demand: 3, supply: 3 },
      { key: "yaroslavl", demand: 4, supply: 2 },
      { key: "north_ossetia", demand: 2, supply: 1 },
      { key: "online", demand: 3, supply: 6 },
    ],
    weeks: hours.map((h, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() - 7 * (hours.length - 1 - i));
      return { week_start: d.toISOString().slice(0, 10), hours: h, participations: Math.round(h / 3) };
    }),
    top: [3, 10, 9, 1, 2].map((id) => ({ volunteer: { id, name: findVolunteer(id)?.name ?? "" },
      hours: findVolunteer(id)?.hours ?? 0, participations: Math.round((findVolunteer(id)?.hours ?? 0) / 3) })),
    dormant: [
      { volunteer: { id: 8, name: findVolunteer(8)?.name ?? "" }, last_attended: null, days: null },
      { volunteer: { id: 9, name: findVolunteer(9)?.name ?? "" }, last_attended: dayAt(-63, 10).slice(0, 10), days: 63 },
    ],
  };
}

/** Как на бэкенде: будни 10:00–18:00 по полчаса на 2 недели, не ближе 2 часов и без занятого. */
function freeSlots(): InterviewSlots {
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  const busy = interviews.filter((i) => i.status === "scheduled").map((i) => new Date(i.starts_at).getTime());
  const from = Date.now() + 2 * 3600_000;
  const slots: string[] = [];
  for (let day = 0; day <= 14; day++) {
    const d = new Date();
    d.setDate(d.getDate() + day);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (let m = 10 * 60; m < 18 * 60; m += 30) {
      d.setHours(Math.floor(m / 60), m % 60, 0, 0);
      const t = d.getTime();
      if (t >= from && busy.every((b) => Math.abs(t - b) >= 30 * 60_000)) slots.push(local(d));
    }
  }
  return { slots, minutes: 30 };
}

export const mockApi: typeof volunteersApi = {
  submit: (data: VolunteerIn) => {
    const parsed = parseQuery(`${data.answers.skills} ${data.answers.about} ${data.answers.wishes}`);
    const v: Volunteer = {
      ...data,
      telegram_id: data.telegram_id ?? null,
      id: nextVolunteerId++,
      status: "new",
      training_score: null,
      hours: 0,
      created_at: new Date().toISOString(),
      profile: {
        skills: parsed.skills,
        interests: [],
        suitable_roles: roles.filter((r) => r.skills.some((s) => parsed.skills.includes(s))).map((r) => r.code),
        summary: data.answers.about.slice(0, 120),
      },
    };
    volunteers.push(v);
    save();
    linkToAccount(v.id);
    return wait(v, 1500); // LLM «думает»
  },
  get: (id) => (findVolunteer(id) ? wait(findVolunteer(id)!) : notFound("Волонтёр")),
  roles: () => wait(roles),
  training: () => wait(modules),
  quiz: (moduleId) => // задержка — как у LLM, который сочиняет вопросы
    quizzes[moduleId] ? wait({ module_id: moduleId, questions: quizzes[moduleId].questions }, 4000) : notFound("Модуль"),
  submitQuiz: (data) => {
    const v = findVolunteer(data.volunteer_id);
    const quiz = quizzes[data.module_id];
    if (!v || !quiz) return notFound("Волонтёр или модуль");
    const correct = quiz.right.map((r, i) => data.answers[i] === r);
    const score = Math.round((100 * correct.filter(Boolean).length) / correct.length);
    const best = (quizScores[v.id] ??= {});
    best[data.module_id] = Math.max(best[data.module_id] ?? 0, score);
    // общий балл — средний по обязательным модулям; «обучение пройдено» — когда все они ≥ 70%
    const required = modules.filter((m) => m.required).map((m) => best[m.id] ?? 0);
    v.training_score = Math.round(required.reduce((a, b) => a + b, 0) / required.length);
    if (v.status === "new") v.status = "training";
    if (required.every((s) => s >= 70) && v.status === "training") v.status = "trained";
    save();
    const result: QuizResult = {
      score,
      passed: score >= 70,
      correct,
      correct_answers: quiz.right,
      status: v.status,
    };
    return wait(result, 1200);
  },
  opportunities: (volunteerId) => {
    refresh();
    return wait(opportunities.map((o) => opportunityOut(o, volunteerId)));
  },
  respond: (opportunityId, volunteerId) => {
    refresh();
    if (!opportunities.some((o) => o.id === opportunityId)) return notFound("Возможность");
    const p = participate(opportunityId, volunteerId, "responded");
    saveOpportunities();
    return wait(p);
  },
  myParticipations: (volunteerId) => {
    refresh();
    return wait(participations.filter((p) => p.volunteer_id === volunteerId).map(withNames));
  },
  interviews: (volunteerId) => {
    refresh();
    const list = interviews.filter((i) => i.volunteer_id === volunteerId);
    return wait(list.sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
  },
  callInfo: (token) => {
    refresh();
    const i = interviews.find((x) => x.token === token);
    if (!i) return notFound("Звонок");
    const info: CallInfo = { starts_at: i.starts_at, status: i.status, ice_servers: [] };
    return wait(info);
  },
  createOpportunity: (data: OpportunityIn) => {
    refresh();
    const o = { ...data, role_code: data.role_code ?? null, id: nextId(opportunities) };
    opportunities.push(o);
    saveOpportunities();
    return wait(opportunityOut(o));
  },
  participants: (opportunityId) => {
    refresh();
    return wait(participations.filter((p) => p.opportunity_id === opportunityId).map(withNames));
  },
  invite: (opportunityId, volunteerIds) => {
    refresh();
    if (!opportunities.some((o) => o.id === opportunityId)) return notFound("Возможность");
    const created = volunteerIds.map((id) => participate(opportunityId, id, "invited"));
    saveOpportunities();
    return wait(created);
  },
  updateParticipation: (id, status: ParticipationStatus) => {
    refresh();
    const p = participations.find((x) => x.id === id);
    if (!p) return notFound("Участие");
    if (status === "attended" && p.status !== "attended") {
      p.hours = opportunities.find((o) => o.id === p.opportunity_id)?.hours ?? 0;
      const v = findVolunteer(p.volunteer_id);
      if (v) v.hours += p.hours;
      save();
    }
    p.status = status;
    saveOpportunities();
    return wait(withNames(p));
  },
  search: (data) => wait(search(data), 1200),
  list: (status) => wait(volunteers.filter((v) => !status || v.status === status)),
  update: (id, data) => {
    const v = findVolunteer(id);
    if (!v) return notFound("Волонтёр");
    Object.assign(v, data);
    save();
    return wait(v);
  },
  notes: (id) => wait(notes.filter((n) => n.volunteer_id === id)),
  addNote: (id, data) => {
    const n: Note = {
      id: notes.length + 1, volunteer_id: id, text: data.text, author: data.author ?? "Координатор",
      created_at: new Date().toISOString(),
    };
    notes.push(n);
    return wait(n);
  },
  thanks: (id) => {
    const v = findVolunteer(id);
    if (!v) return notFound("Волонтёр");
    return wait({
      text: `${v.name}, здравствуйте!\n\nСпасибо вам за ${v.hours} ч. волонтёрской помощи фонду! Будем рады видеть вас снова.\n\nФонд «Дети Марии»`,
      ai: false,
    });
  },
  exportCsvUrl: "data:text/csv;charset=utf-8,%EF%BB%BF%D0%94%D0%B5%D0%BC%D0%BE-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC",
  scheduleInterview: (volunteerId, startsAt) => {
    refresh();
    const v = findVolunteer(volunteerId);
    if (!v) return notFound("Волонтёр");
    const i: Interview = {
      id: nextId(interviews), volunteer_id: volunteerId, starts_at: startsAt, status: "scheduled",
      token: `demo-${Math.random().toString(36).slice(2, 12)}`, notified: v.telegram_id != null,
      created_at: new Date().toISOString(), result: null,
    };
    interviews.push(i);
    saveOpportunities();
    return wait(i);
  },
  interviewSlots: () => {
    refresh();
    return wait(freeSlots());
  },
  bookInterview: (volunteerId, startsAt) => {
    refresh();
    const v = findVolunteer(volunteerId);
    if (!v) return notFound("Волонтёр");
    if (!["trained", "approved", "active"].includes(v.status))
      return Promise.reject(new Error("Сначала пройдите обучение — после него можно записаться на собеседование"));
    const since = Date.now() - 2 * 3600_000;
    if (interviews.some((i) => i.volunteer_id === volunteerId && i.status === "scheduled" && new Date(i.starts_at).getTime() >= since))
      return Promise.reject(new Error("Вы уже записаны на собеседование. Чтобы выбрать другое время, отмените запись"));
    if (!freeSlots().slots.includes(startsAt)) return Promise.reject(new Error("Это время уже занято или прошло — выберите другое"));
    return mockApi.scheduleInterview(volunteerId, startsAt);
  },
  updateInterview: (id, status) => {
    refresh();
    const i = interviews.find((x) => x.id === id);
    if (!i) return notFound("Собеседование");
    i.status = status;
    saveOpportunities();
    return wait(i);
  },  interviewPlan: (volunteerId) => {
    const v = findVolunteer(volunteerId);
    return v ? wait(interviewPlan(v), 1200) : notFound("Волонтёр"); // задержка — как у LLM
  },
  saveInterviewResult: (id, data) => {
    refresh();
    const i = interviews.find((x) => x.id === id);
    if (!i) return notFound("Собеседование");
    if (i.status === "canceled") return Promise.reject(new Error("Собеседование отменено — итог не сохраняем"));
    i.result = { ...data, created_at: new Date().toISOString() };
    i.status = "done";
    saveOpportunities();
    return wait(i);
  },
  dashboardToday: () => {
    refresh();
    return wait(dashboardToday());
  },
  dashboardAnalytics: () => wait(dashboardAnalytics()),
  dialog: (volunteerId, reader) => {
    const v = findVolunteer(volunteerId);
    if (!v) return notFound("Волонтёр");
    const d = loadDialogs();
    const other: Sender = reader === "volunteer" ? "coordinator" : "volunteer";
    return wait(
      {
        volunteer: { id: v.id, name: v.name },
        messages: d.messages.filter((m) => m.volunteer_id === volunteerId).map(messageOut),
        unread: unreadFor(d, volunteerId, reader),
        their_read_id: d.read[volunteerId]?.[other] ?? 0,
      },
      150,
    );
  },
  sendMessage: (volunteerId, data) => {
    if (!findVolunteer(volunteerId)) return notFound("Волонтёр");
    const text = data.text.trim();
    if (!text) return Promise.reject(new Error("Пустое сообщение"));
    const d = loadDialogs();
    const m: MockMessage = {
      id: Math.max(0, ...d.messages.map((x) => x.id)) + 1, volunteer_id: volunteerId, sender: data.sender, text,
      opportunity_id: data.opportunity_id ?? null, opportunity_title: null, created_at: new Date().toISOString(),
    };
    d.messages.push(m);
    setRead(d, volunteerId, data.sender, m.id); // своё — прочитано
    saveDialogs(d);
    return wait(messageOut(m), 200);
  },
  markRead: (volunteerId, reader) => {
    const d = loadDialogs();
    setRead(d, volunteerId, reader, lastId(d, volunteerId));
    saveDialogs(d);
    const ids = [...new Set(d.messages.map((m) => m.volunteer_id))];
    const unread = reader === "volunteer" ? 0 : ids.reduce((n, id) => n + unreadFor(d, id, "coordinator"), 0);
    return wait({ unread }, 100);
  },
  dialogs: () => {
    refresh();
    const d = loadDialogs();
    const ids = [...new Set(d.messages.map((m) => m.volunteer_id))];
    const list: DialogSummary[] = ids
      .map((id) => {
        const last = d.messages.filter((m) => m.volunteer_id === id).at(-1)!;
        return {
          volunteer: { id, name: findVolunteer(id)?.name ?? `Волонтёр №${id}` },
          last: messageOut(last),
          unread: unreadFor(d, id, "coordinator"),
        };
      })
      .sort((a, b) => b.last!.id - a.last!.id);
    return wait(list, 150);
  },

};

/** Моки для «Спросить о фонде» (api.chat / api.ask из шаблона). */
export const mockChatApi = {
  chat: (message: string): Promise<ChatResponse> =>
    wait({ answer: `Демо-режим: здесь будет ответ помощника на «${message}».`, provider: "mock", model: "mock" }, 800),
  ask: (question: string): Promise<AskResponse> =>
    wait({
      found: /волонт/i.test(question),
      answer: /волонт/i.test(question)
        ? "Заполните анкету в этом приложении — координатор свяжется с вами и пригласит на встречу-знакомство."
        : "В документах фонда ответа на этот вопрос нет. Напишите координатору.",
      sources: [],
    }, 800),
};

// ===== Вход по почте и паролю =====
// Аккаунты живут в localStorage (mock_accounts); пароль в моках хранится как есть — это только демо в браузере.
// Сбросить: localStorage.removeItem("mock_accounts").

type MockAccount = Account & { password: string; token: string; look?: Look };
const ACCOUNTS_KEY = "mock_accounts";

function loadAccounts(): MockAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveAccounts(list: MockAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* приватный режим — аккаунт живёт до перезагрузки */
  }
}

function currentAccount(list: MockAccount[]): MockAccount | undefined {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* без входа */
  }
  return list.find((a) => a.token === token);
}

function authOut(a: MockAccount): AuthOut {
  return { token: a.token, account: { id: a.id, email: a.email, role: a.role, volunteer_id: a.volunteer_id } };
}

/** Как на бэкенде: анкета из аккаунта волонтёра становится его анкетой. */
function linkToAccount(volunteerId: number) {
  const list = loadAccounts();
  const a = currentAccount(list);
  if (a && a.role === "volunteer" && a.volunteer_id === null) {
    a.volunteer_id = volunteerId;
    saveAccounts(list);
  }
}

/** Код фонда в моках — как на бэкенде: 1111, пока координатор не сменил его в «Настройках». */
const FUND_CODE_KEY = "mock_fund_code";

function loadFundCode(): string {
  try {
    return localStorage.getItem(FUND_CODE_KEY) ?? "1111";
  } catch {
    return "1111";
  }
}

function coordinatorOnly(): Promise<never> | null {
  const a = currentAccount(loadAccounts());
  if (!a) return Promise.reject(new Error("Войдите заново"));
  if (a.role !== "coordinator") return Promise.reject(new Error("Это может только координатор фонда"));
  return null;
}

export const mockAuthApi: typeof authApi = {
  register: (data) => {
    const list = loadAccounts();
    const email = data.email.trim().toLowerCase();
    if (list.some((a) => a.email === email)) return Promise.reject(new Error("Эта почта уже зарегистрирована — войдите"));
    if (data.role === "coordinator" && (data.code ?? "").trim() !== loadFundCode())
      return Promise.reject(new Error("Неверный код фонда. Его выдаёт руководитель фонда"));
    const a: MockAccount = {
      id: list.length + 1,
      email,
      role: data.role,
      volunteer_id: null,
      password: data.password,
      token: `mock-${Date.now()}`,
    };
    saveAccounts([...list, a]);
    return wait(authOut(a), 600);
  },
  login: (data) => {
    const a = loadAccounts().find((x) => x.email === data.email.trim().toLowerCase());
    if (!a || a.password !== data.password) return Promise.reject(new Error("Неверная почта или пароль"));
    return wait(authOut(a), 600);
  },
  me: () => {
    const a = currentAccount(loadAccounts());
    return a ? wait(authOut(a).account, 200) : Promise.reject(new Error("Войдите заново"));
  },
  look: () => {
    const a = currentAccount(loadAccounts());
    if (!a) return Promise.reject(new Error("Войдите заново"));
    return wait(a.look ?? { avatar: "", color: "blue", cover: "sky", stickers: [], nickname: "" }, 200);
  },
  saveLook: (look) => {
    const list = loadAccounts();
    const a = currentAccount(list);
    if (!a) return Promise.reject(new Error("Войдите заново"));
    a.look = { ...look, nickname: look.nickname.trim() };
    saveAccounts(list);
    return wait(a.look, 300);
  },
  fundCode: () => coordinatorOnly() ?? wait({ code: loadFundCode() }, 200),
  setFundCode: (data) => {
    const denied = coordinatorOnly();
    if (denied) return denied;
    const code = data.code.trim();
    if (code.length < 4 || /\s/.test(code)) return Promise.reject(new Error("Код — от 4 символов, без пробелов"));
    try {
      localStorage.setItem(FUND_CODE_KEY, code);
    } catch {
      /* приватный режим — код не запомнится */
    }
    return wait({ code }, 400);
  },
};
