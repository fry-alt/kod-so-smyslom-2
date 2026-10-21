// Анкета волонтёра (T-07): сайт и Telegram Mini App.
// Имя и контакт хранятся только в нашей базе. Ответы о себе — обезличенно — разбирает AI.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { Answers, Availability, Format, Occupation, Region, Regularity, Role, Volunteer } from "../../api";
import { backend, setVolunteerId } from "../../backend";
import { AVAILABILITY, FORMAT, OCCUPATION, REGION, REGULARITY } from "../../labels";
import { navigate } from "../../router";
import { tg, tgUser } from "../../telegram";
import { Badge, Button, Card, Chips, ErrorBox, errorText, Field, inputClass } from "../../ui";

type Draft = { name: string; contact: string; consent: boolean; answers: Answers };

const DRAFT_KEY = "form_draft";

function emptyDraft(): Draft {
  const tgName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ");
  return {
    name: tgName,
    contact: tgUser?.username ? `@${tgUser.username}` : "",
    consent: false,
    answers: {
      about: "",
      skills: "",
      wishes: "",
      experience: "",
      availability: [],
      occupation: "other",
      region: "moscow",
      formats: ["offline"],
      regularity: "any",
    },
  };
}

/** Черновик сохраняется на устройстве — чтобы не потерять текст, если человек отвлёкся. */
function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (saved?.answers) return { ...emptyDraft(), ...saved, answers: { ...emptyDraft().answers, ...saved.answers } };
  } catch {
    /* нет черновика или он испорчен — начинаем с пустого */
  }
  return emptyDraft();
}

type Errors = Partial<Record<"name" | "contact" | "about" | "availability" | "formats" | "consent", string>>;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = "Напишите, как к вам обращаться";
  const c = d.contact.trim();
  if (!c) e.contact = "Оставьте телефон, e-mail или ник в Telegram — иначе мы не сможем связаться";
  else if (!/@|\d{5,}/.test(c.replace(/[\s()-]/g, ""))) e.contact = "Похоже на опечатку: нужен телефон, e-mail или @ник";
  if (!d.answers.about.trim()) e.about = "Расскажите о себе хотя бы пару слов";
  if (d.answers.availability.length === 0) e.availability = "Отметьте хотя бы один вариант";
  if (d.answers.formats.length === 0) e.formats = "Отметьте хотя бы один вариант";
  if (!d.consent) e.consent = "Без согласия мы не можем сохранить анкету";
  return e;
}

export default function Form() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Volunteer | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* приватный режим — без черновика */
    }
  }, [draft]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setAnswers = (patch: Partial<Answers>) => setDraft((d) => ({ ...d, answers: { ...d.answers, ...patch } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      // показать первую ошибку — после перерисовки, когда сообщение уже на экране
      setTimeout(() => document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setSending(true);
    setError("");
    try {
      const a = draft.answers;
      const v = await backend.submit({
        name: draft.name.trim(),
        contact: draft.contact.trim(),
        telegram_id: tgUser?.id ?? null,
        answers: {
          ...a,
          about: a.about.trim(),
          skills: a.skills.trim(),
          wishes: a.wishes.trim(),
          experience: a.experience.trim(),
        },
      });
      setVolunteerId(v.id);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* не страшно */
      }
      tg?.HapticFeedback?.impactOccurred("medium");
      setResult(v);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  if (result) return <Thanks volunteer={result} />;

  const a = draft.answers;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Анкета волонтёра</h1>
        <p className="mt-2 text-hint">
          Займёт 5–7 минут. Ответы сохраняются на этом устройстве, пока вы не отправите анкету.
        </p>
      </div>

      <Section title="О вас">
        <Field label="Как вас зовут" required error={errors.name}>
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            autoComplete="name"
            maxLength={100}
            placeholder="Имя и фамилия"
          />
        </Field>
        <Field
          label="Как с вами связаться"
          required
          hint="Телефон, e-mail или ник в Telegram"
          error={errors.contact}
        >
          <input
            className={inputClass}
            value={draft.contact}
            onChange={(e) => set({ contact: e.target.value })}
            maxLength={200}
            placeholder="+7 900 000-00-00 или @nickname"
          />
        </Field>
        <Field label="Чем вы сейчас заняты" group>
          <Chips<Occupation>
            options={OCCUPATION}
            value={[a.occupation]}
            onChange={([v]) => setAnswers({ occupation: v })}
          />
        </Field>
        <Field label="Где вы живёте" group hint="Фонд работает в Москве, Подмосковье, Ярославской области и Северной Осетии">
          <Chips<Region> options={REGION} value={[a.region]} onChange={([v]) => setAnswers({ region: v })} />
        </Field>
      </Section>

      <Section title="Что вы умеете и хотите">
        <TextArea
          label="Расскажите о себе"
          required
          error={errors.about}
          hint="Чем занимаетесь, что вам интересно, почему решили помогать"
          placeholder="Например: я на пенсии, 20 лет работала учителем рисования, люблю возиться с детьми"
          value={a.about}
          onChange={(v) => setAnswers({ about: v })}
        />
        <TextArea
          label="Что вы умеете"
          hint="Профессия, хобби — всё, что может пригодиться"
          placeholder="Например: керамика, фотография, шитьё, монтаж видео, веду соцсети"
          value={a.skills}
          onChange={(v) => setAnswers({ skills: v })}
        />
        <TextArea
          label="Чем хотели бы помогать фонду"
          placeholder="Например: помогать на занятиях с детьми, снимать мероприятия, помогать на ярмарках"
          value={a.wishes}
          onChange={(v) => setAnswers({ wishes: v })}
        />
        <TextArea
          label="Ваш опыт"
          hint="Волонтёрство, работа с детьми или людьми с особенностями развития. Если опыта нет — это нормально"
          placeholder="Например: год помогала в приюте для животных; с особыми детьми не работала, но готова учиться"
          value={a.experience}
          onChange={(v) => setAnswers({ experience: v })}
        />
      </Section>

      <Section title="Когда и как">
        <Field
          label="Когда вы обычно свободны"
          required
          group
          error={errors.availability}
          hint={
            <>
              🧡 <b>Фонду особенно нужна помощь в будни днём</b> — группы из интернатов приезжают утром. Мастерские
              работают по субботам.
            </>
          }
        >
          <Chips<Availability>
            multiple
            options={AVAILABILITY}
            value={a.availability}
            onChange={(v) => setAnswers({ availability: v })}
          />
        </Field>
        <Field label="Как удобнее помогать" required group error={errors.formats}>
          <Chips<Format> multiple options={FORMAT} value={a.formats} onChange={(v) => setAnswers({ formats: v })} />
        </Field>
        <Field label="Как часто" group>
          <Chips<Regularity>
            options={REGULARITY}
            value={[a.regularity]}
            onChange={([v]) => setAnswers({ regularity: v })}
          />
        </Field>
      </Section>

      <div data-error={errors.consent ? "" : undefined} className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={draft.consent}
            onChange={(e) => set({ consent: e.target.checked })}
            className="mt-1 size-6 shrink-0 accent-[var(--color-accent)]"
          />
          <span>
            Согласен(на) на обработку персональных данных фондом «Дети Марии». Имя и контакт видит только координатор
            фонда, в AI-сервисы они не передаются.
          </span>
        </label>
        {errors.consent && <span className="text-sm font-medium text-red-700">{errors.consent}</span>}
      </div>

      {error && <ErrorBox text={`Не получилось отправить анкету: ${error}`} />}
      {sending && (
        <p className="animate-pulse text-center text-hint">Отправляем и разбираем анкету — это займёт до 10 секунд…</p>
      )}
      <Button type="submit" wide loading={sending}>
        Отправить анкету
      </Button>
    </form>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-xl font-bold">{props.title}</h2>
      {props.children}
    </Card>
  );
}

function TextArea(props: {
  label: string;
  hint?: string;
  placeholder: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={props.label} hint={props.hint} required={props.required} error={props.error}>
      <textarea
        className={`${inputClass} min-h-28 resize-y`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        maxLength={2000}
        rows={3}
      />
    </Field>
  );
}

/** «Спасибо! Вот что мы о вас поняли» — профиль от AI. Если AI ещё не разобрал анкету, профиль пустой. */
function Thanks(props: { volunteer: Volunteer }) {
  const v = props.volunteer;
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    backend.roles().then(setRoles).catch(() => setRoles([])); // без названий ролей экран всё равно полезен
  }, []);

  const p = v.profile;
  const roleTitles = (p?.suitable_roles ?? [])
    .map((code) => roles.find((r) => r.code === code)?.title)
    .filter((t): t is string => !!t);
  const tags = [...new Set([...(p?.skills ?? []), ...(p?.interests ?? [])])];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Спасибо, {v.name.split(" ")[0]}!</h1>
      <p>Анкета у нас. Координатор посмотрит её и свяжется с вами, чтобы договориться о встрече-знакомстве.</p>
      {p && (tags.length > 0 || roleTitles.length > 0) ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Вот что мы о вас поняли</h2>
          {p.summary && <p>{p.summary}</p>}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Badge key={t} className="bg-page">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {roleTitles.length > 0 && (
            <div>
              <p className="font-semibold">Вам может подойти:</p>
              <ul className="mt-1 list-inside list-disc">
                {roleTitles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-hint">Если что-то не так — расскажите координатору на встрече.</p>
        </Card>
      ) : (
        <Card>
          <p className="text-hint">Мы ещё разбираем вашу анкету — подходящие задачи появятся в разделе «Мой статус».</p>
        </Card>
      )}
      <p>Пока можно познакомиться с фондом и пройти короткое обучение — оно нужно до первого занятия.</p>
      <Button wide onClick={() => navigate("/training")}>
        Пройти обучение
      </Button>
      <Button wide variant="secondary" onClick={() => navigate("/me")}>
        Мой статус
      </Button>
    </div>
  );
}
