// Оформление личного кабинета: аватар, цвет кружка, обложка шапки, стикеры и как к вам обращаться.
// Фото не загружаем — это персональные данные; вместо фото — эмодзи-аватар.
// Часть стикеров открывается за шаги пути в фонде — маленькая награда за анкету, обучение и занятия.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Look, LookColor, LookCover } from "../../api";
import { saveLook } from "../../backend";
import { Icon } from "../../icons";
import { Button, ErrorBox, errorText, inputClass } from "../../ui";

const AVATARS = ["🦊", "🐻", "🐱", "🐶", "🐼", "🦉", "🐢", "🐝", "🦋", "🐞", "🌻", "🌳", "☀️", "🌈", "🎨", "🎸"];

/** Цвета кружка — из логотипа фонда; на светлых (голубой, жёлтый) буква тёмная. */
export const COLORS: Record<LookColor, { label: string; bg: string; text: string }> = {
  blue: { label: "Синий", bg: "var(--logo-blue)", text: "#fff" },
  berry: { label: "Ягодный", bg: "var(--logo-berry)", text: "#fff" },
  green: { label: "Зелёный", bg: "var(--p-accent)", text: "#fff" },
  orange: { label: "Оранжевый", bg: "var(--p-cta)", text: "#fff" },
  cyan: { label: "Голубой", bg: "var(--logo-cyan)", text: "var(--p-ink)" },
  yellow: { label: "Жёлтый", bg: "var(--logo-yellow)", text: "var(--p-ink)" },
};

/** Обложка шапки: фон и два плавающих пятна. На тёмной «Вечер» текст светлый. */
export const COVERS: Record<LookCover, { label: string; base: string; blobs: [string, string]; dark?: boolean }> = {
  sky: { label: "Небо", base: "var(--p-soft)", blobs: ["var(--logo-yellow)", "var(--logo-cyan)"] },
  sunset: { label: "Закат", base: "#fde7da", blobs: ["var(--logo-orange)", "var(--logo-berry)"] },
  meadow: { label: "Луг", base: "#e1f1e5", blobs: ["var(--logo-green)", "var(--logo-yellow)"] },
  sea: { label: "Море", base: "#dde8f7", blobs: ["var(--logo-cyan)", "var(--logo-blue)"] },
  berry: { label: "Ягода", base: "#f7e2ed", blobs: ["var(--logo-berry)", "var(--logo-yellow)"] },
  night: { label: "Вечер", base: "#14245c", blobs: ["var(--logo-cyan)", "var(--logo-berry)"], dark: true },
};

/** Чего человек уже добился — от этого зависят открытые стикеры. */
export type Progress = { hasForm: boolean; trained: boolean; attended: number; hours: number };

type Sticker = { emoji: string; label: string; earned?: (p: Progress) => boolean; how?: string };

const STICKERS: Sticker[] = [
  { emoji: "🌻", label: "Подсолнух" },
  { emoji: "🧡", label: "Сердце" },
  { emoji: "🌈", label: "Радуга" },
  { emoji: "🎨", label: "Творчество" },
  { emoji: "🎵", label: "Музыка" },
  { emoji: "📚", label: "Книги" },
  { emoji: "☕", label: "Чай" },
  { emoji: "🐾", label: "Лапки" },
  { emoji: "📝", label: "Анкета заполнена", earned: (p) => p.hasForm, how: "после анкеты" },
  { emoji: "🎓", label: "Обучение пройдено", earned: (p) => p.trained, how: "после обучения" },
  { emoji: "🤝", label: "Первое занятие", earned: (p) => p.attended > 0, how: "после первого занятия" },
  { emoji: "⭐", label: "10 часов помощи", earned: (p) => p.hours >= 10, how: "за 10 часов помощи" },
];

export const MAX_STICKERS = 3;

// ===== Аватар и обложка — общие для шапки кабинета и предпросмотра =====

/** Где стикеры «приклеены» к аватару: справа сверху, справа снизу, слева снизу. */
const STICKER_SPOTS = ["-top-2 -right-3 rotate-12", "-right-4 bottom-0 -rotate-6", "-bottom-2 -left-3 -rotate-12"];

export function Avatar(props: { look: Look; letter: string; small?: boolean }) {
  const color = COLORS[props.look.color] ?? COLORS.blue;
  const size = props.small ? "size-14" : "size-16 sm:size-20";
  const text = props.look.avatar
    ? props.small ? "text-3xl" : "text-4xl sm:text-5xl"
    : props.small ? "text-2xl" : "text-2xl sm:text-3xl";
  const sticker = props.small ? "size-7 text-base" : "size-7 text-base sm:size-8 sm:text-lg";
  return (
    <span aria-hidden="true" className="relative shrink-0">
      <span
        style={{ background: color.bg, color: color.text, boxShadow: `0 10px 24px -12px ${color.bg}` }}
        className={`flex items-center justify-center rounded-full font-display font-semibold ${size} ${text}`}
      >
        {props.look.avatar || props.letter}
      </span>
      {props.look.stickers.slice(0, MAX_STICKERS).map((s, i) => (
        <span
          key={s}
          className={`absolute flex items-center justify-center rounded-full bg-white shadow-md ring-2 ring-white transition hover:scale-125 hover:rotate-0 ${sticker} ${STICKER_SPOTS[i]}`}
        >
          {s}
        </span>
      ))}
    </span>
  );
}

/** Фон шапки по выбранной обложке; содержимое — поверх. На тёмной обложке подсказки (text-hint) светлее. */
export function Cover(props: { cover: LookCover; className?: string; children: ReactNode }) {
  const c = COVERS[props.cover] ?? COVERS.sky;
  return (
    <section
      style={{ background: c.base, ...(c.dark ? { "--color-hint": "#c9d3f0" } : {}) } as CSSProperties}
      className={`relative overflow-clip ${c.dark ? "text-white" : ""} ${props.className ?? ""}`}
    >
      <span aria-hidden="true" className="auth-blob auth-blob-1" style={{ background: c.blobs[0] }} />
      <span aria-hidden="true" className="auth-blob auth-blob-2" style={{ background: c.blobs[1] }} />
      <div className="relative">{props.children}</div>
    </section>
  );
}

// ===== Окно «Оформить кабинет» =====

export function LookEditor(props: {
  open: boolean;
  look: Look;
  letter: string;
  /** имя из анкеты — подсказка в поле «Как к вам обращаться» */
  name: string | null;
  progress: Progress;
  onClose: () => void;
  onSaved: (look: Look) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(props.look);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      setDraft(props.look);
      setError(null);
      dialog.showModal();
    }
    if (!props.open && dialog.open) dialog.close();
  }, [props.open, props.look]);

  const set = (change: Partial<Look>) => setDraft((d) => ({ ...d, ...change }));

  function toggleSticker(emoji: string) {
    setDraft((d) => {
      if (d.stickers.includes(emoji)) return { ...d, stickers: d.stickers.filter((s) => s !== emoji) };
      return d.stickers.length < MAX_STICKERS ? { ...d, stickers: [...d.stickers, emoji] } : d;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      props.onSaved(await saveLook(draft));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const greeting = draft.nickname.trim() || props.name;
  const letter = (draft.nickname.trim() || props.letter)[0].toUpperCase();

  return (
    <dialog
      ref={ref}
      onClose={props.onClose}
      aria-labelledby="look-title"
      className="m-auto w-[min(40rem,calc(100%-2rem))] rounded-[2rem] bg-page p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <h2 id="look-title" className="font-display text-2xl font-semibold">
            Оформить кабинет
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Закрыть"
            className="flex size-12 items-center justify-center rounded-full text-2xl text-hint hover:bg-surface hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 pt-4 pb-5 *:shrink-0 sm:px-6">
          {/* предпросмотр — как будет выглядеть шапка */}
          <Cover cover={draft.cover} className="rounded-3xl p-5">
            <div className="flex items-center gap-4">
              <Avatar look={draft} letter={letter} small />
              <span className="font-display text-xl leading-tight font-semibold">
                {greeting ? `Здравствуйте, ${greeting}!` : "Добро пожаловать!"}
              </span>
            </div>
          </Cover>

          <label className="flex flex-col gap-1.5">
            <span className="text-lg font-semibold">Как к вам обращаться</span>
            <span className="text-sm text-hint">
              {props.name ? `Если оставить пустым — «${props.name}», как в анкете.` : "Например, Анна или Анна Петровна."}
            </span>
            <input
              value={draft.nickname}
              onChange={(e) => set({ nickname: e.target.value })}
              maxLength={40}
              placeholder={props.name ?? "Ваше имя"}
              className={inputClass}
            />
          </label>

          <Section title="Аватар">
            <div role="radiogroup" aria-label="Аватар" className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {["", ...AVATARS].map((a) => (
                <Pick
                  key={a || "letter"}
                  name="look-avatar"
                  on={draft.avatar === a}
                  onClick={() => set({ avatar: a })}
                  label={a ? `Аватар ${a}` : "Первая буква имени"}
                >
                  {a || <span className="font-display text-xl font-semibold">{letter}</span>}
                </Pick>
              ))}
            </div>
          </Section>

          <Section title="Цвет кружка">
            <div role="radiogroup" aria-label="Цвет кружка" className="flex flex-wrap gap-3">
              {(Object.keys(COLORS) as LookColor[]).map((c) => (
                <label
                  key={c}
                  title={COLORS[c].label}
                  style={{ background: COLORS[c].bg, color: COLORS[c].text }}
                  className={`relative flex size-12 cursor-pointer items-center justify-center rounded-full text-lg font-bold transition hover:scale-110 ${
                    draft.color === c ? "ring-4 ring-ink/70 ring-offset-2 ring-offset-page" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="look-color"
                    aria-label={COLORS[c].label}
                    checked={draft.color === c}
                    onChange={() => set({ color: c })}
                    className="sr-only"
                  />
                  <span aria-hidden="true">{draft.color === c && "✓"}</span>
                </label>
              ))}
            </div>
          </Section>

          <Section title="Обложка">
            <div role="radiogroup" aria-label="Обложка" className="grid grid-cols-3 gap-3">
              {(Object.keys(COVERS) as LookCover[]).map((c) => (
                <label
                  key={c}
                  className={`relative flex cursor-pointer flex-col gap-1.5 rounded-2xl p-1.5 text-left transition select-none hover:bg-surface ${
                    draft.cover === c ? "bg-surface ring-2 ring-accent" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="look-cover"
                    checked={draft.cover === c}
                    onChange={() => set({ cover: c })}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="h-12 rounded-xl"
                    style={{
                      background: `radial-gradient(circle at 85% 15%, ${COVERS[c].blobs[0]} 0 22%, transparent 55%), radial-gradient(circle at 10% 95%, ${COVERS[c].blobs[1]} 0 20%, transparent 55%), ${COVERS[c].base}`,
                    }}
                  />
                  <span className="px-1 font-semibold">
                    {draft.cover === c && <span aria-hidden="true">✓ </span>}
                    {COVERS[c].label}
                  </span>
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="Стикеры на аватар"
            hint={`Выбрано ${draft.stickers.length} из ${MAX_STICKERS}. Некоторые открываются за шаги в фонде.`}
          >
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {STICKERS.map((s) => {
                const open = !s.earned || s.earned(props.progress);
                const on = draft.stickers.includes(s.emoji);
                const full = !on && draft.stickers.length >= MAX_STICKERS;
                return (
                  <button
                    key={s.emoji}
                    type="button"
                    aria-pressed={on}
                    disabled={!open || full}
                    onClick={() => toggleSticker(s.emoji)}
                    title={open ? s.label : `${s.label} — откроется ${s.how}`}
                    className={`relative flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 py-2 text-center transition ${
                      on ? "border-accent bg-soft" : "border-line bg-page enabled:hover:border-accent"
                    } ${!open ? "opacity-60" : full ? "opacity-40" : ""}`}
                  >
                    <span className={`text-3xl ${open ? "" : "grayscale"}`}>{s.emoji}</span>
                    <span className="text-xs leading-tight text-hint">
                      {!open && <Icon name="lock" className="mr-0.5 size-[1.1em] align-[-0.18em]" />}
                      {open ? s.label : s.how}
                    </span>
                    {on && (
                      <span className="absolute top-1 right-1.5 text-sm font-bold text-accent" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          {error && <ErrorBox text={error} />}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-line px-5 py-4 sm:px-6">
          <Button onClick={save} loading={saving}>
            Сохранить
          </Button>
          <Button variant="secondary" onClick={props.onClose}>
            Отмена
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function Section(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">{props.title}</h3>
      {props.hint && <p className="-mt-1 text-sm text-hint">{props.hint}</p>}
      {props.children}
    </div>
  );
}

/** Вариант аватара — настоящий radio внутри карточки: стрелки переключают выбор. */
function Pick(props: { name: string; on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <label
      className={`relative flex aspect-square min-h-12 cursor-pointer items-center justify-center rounded-2xl text-3xl transition select-none hover:scale-110 ${
        props.on ? "bg-soft ring-2 ring-accent" : "bg-surface"
      }`}
    >
      <input
        type="radio"
        name={props.name}
        aria-label={props.label}
        checked={props.on}
        onChange={props.onClick}
        className="sr-only"
      />
      <span aria-hidden="true">{props.children}</span>
    </label>
  );
}
