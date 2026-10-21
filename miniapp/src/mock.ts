// Моки бэкенда по контракту из api.ts — чтобы интерфейс работал без бэкенда.
// Включаются переменной VITE_MOCK=1 (см. backend.ts). Данные вымышленные и живут в памяти вкладки;
// волонтёры дополнительно сохраняются в localStorage, чтобы после перезагрузки работал «Мой статус».
// Сбросить демо-данные: localStorage.removeItem("mock_volunteers").
import type {
  AskResponse,
  Availability,
  Candidate,
  CallInfo,
  ChatResponse,
  Interview,
  Note,
  Opportunity,
  OpportunityIn,
  Participation,
  ParticipationStatus,
  ParsedQuery,
  Quiz,
  QuizResult,
  Region,
  Regularity,
  Role,
  SearchRequest,
  SearchResponse,
  TrainingModule,
  Volunteer,
  VolunteerIn,
  volunteersApi,
} from "./api";

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

// Видеособеседования. Сам звонок на моках не работает — ему нужен сигнальный сервер бэкенда.
const interviews: Interview[] = [
  { id: 1, volunteer_id: 1, starts_at: "2026-10-22T15:00:00", status: "scheduled", token: "demo-call-token",
    notified: true, created_at: "2026-10-21T12:00:00" },
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
    const result: QuizResult = { score, passed: score >= 70, correct, status: v.status };
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
  scheduleInterview: (volunteerId, startsAt) => {
    refresh();
    const v = findVolunteer(volunteerId);
    if (!v) return notFound("Волонтёр");
    const i: Interview = {
      id: nextId(interviews), volunteer_id: volunteerId, starts_at: startsAt, status: "scheduled",
      token: `demo-${Math.random().toString(36).slice(2, 12)}`, notified: v.telegram_id != null,
      created_at: new Date().toISOString(),
    };
    interviews.push(i);
    saveOpportunities();
    return wait(i);
  },
  updateInterview: (id, status) => {
    refresh();
    const i = interviews.find((x) => x.id === id);
    if (!i) return notFound("Собеседование");
    i.status = status;
    saveOpportunities();
    return wait(i);
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
