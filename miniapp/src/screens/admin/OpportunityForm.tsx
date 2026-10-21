// Новое занятие: выбрать роль фонда — подставим название, описание и формат, остаётся дата и место.
import { useState, type FormEvent } from "react";

import type { Format, OpportunityIn, Region, Role } from "../../api";
import { backend } from "../../backend";
import { FORMAT, REGION } from "../../labels";
import { navigate } from "../../router";
import { Button, Card, Chips, ErrorBox, errorText, Field, inputClass, Link, Loading, useLoad } from "../../ui";

/** Завтра в 10:00 — в формате поля «дата и время» (местное время). */
function tomorrowMorning(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

type Draft = {
  role_code: string | null;
  title: string;
  description: string;
  starts_at: string;
  region: Region;
  format: Format;
  place: string;
  slots: string;
  hours: string;
};

export default function OpportunityForm() {
  const roles = useLoad(() => backend.roles());
  const [d, setD] = useState<Draft>({
    role_code: null,
    title: "",
    description: "",
    starts_at: tomorrowMorning(),
    region: "moscow",
    format: "offline",
    place: "",
    slots: "1",
    hours: "3",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }));

  function pickRole(r: Role | null) {
    if (!r) return set("role_code", null);
    setD((x) => ({
      ...x,
      role_code: r.code,
      title: r.title,
      description: r.description,
      format: r.format,
      region: r.regions.includes(x.region) ? x.region : (r.regions[0] ?? x.region),
      place: r.format === "online" ? "Онлайн" : x.place === "Онлайн" ? "" : x.place,
    }));
  }

  function validate(): OpportunityIn | null {
    const e: typeof errors = {};
    const slots = Number(d.slots);
    const hours = Number(d.hours.replace(",", "."));
    if (!d.title.trim()) e.title = "Напишите, что нужно сделать.";
    if (!d.starts_at) e.starts_at = "Укажите дату и время.";
    if (!Number.isInteger(slots) || slots < 1) e.slots = "Нужен хотя бы один человек.";
    if (!(hours > 0)) e.hours = "Укажите, сколько часов засчитать, например 3.";
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      title: d.title.trim(),
      description: d.description.trim(),
      role_code: d.role_code,
      starts_at: d.starts_at.length === 16 ? d.starts_at + ":00" : d.starts_at,
      region: d.region,
      format: d.format,
      place: d.place.trim(),
      slots,
      hours,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const data = validate();
    if (!data) {
      // показать первую ошибку — она может быть выше экрана
      requestAnimationFrame(() => document.querySelector("[data-error]")?.scrollIntoView({ block: "center" }));
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const o = await backend.createOpportunity(data);
      navigate(`/admin/opportunities/${o.id}`);
    } catch (err) {
      setSaveError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5" noValidate>
      <Link to="/admin/opportunities">← Занятия</Link>
      <h1 className="text-3xl font-bold">Новое занятие</h1>

      <Card className="flex flex-col gap-3">
        <Field label="Роль фонда" hint="Выберите роль — подставим название, описание и формат. Можно без роли." group>
          {roles.loading && <Loading text="Загружаем роли…" />}
          {roles.error && <ErrorBox text={roles.error} onRetry={roles.reload} />}
          {roles.data && (
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {[null, ...roles.data].map((r) => {
                const on = d.role_code === (r?.code ?? null);
                return (
                  <button
                    key={r?.code ?? "none"}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickRole(r)}
                    className={`min-h-12 rounded-2xl border px-4 py-2 text-left transition ${
                      on ? "border-accent bg-accent text-accent-text" : "border-line bg-page"
                    }`}
                  >
                    {r?.title ?? "Без роли"}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label="Что нужно сделать" required error={errors.title}>
          <input
            className={inputClass}
            value={d.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Например: помощь на занятии по керамике"
          />
        </Field>
        <Field label="Описание для волонтёров" hint="Что делать, кого ждём, что взять с собой.">
          <textarea
            className={`${inputClass} min-h-28`}
            value={d.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Дата и время" required error={errors.starts_at}>
            <input
              type="datetime-local"
              className={inputClass}
              value={d.starts_at}
              onChange={(e) => set("starts_at", e.target.value)}
            />
          </Field>
          <Field label="Сколько нужно людей" required error={errors.slots}>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className={inputClass}
              value={d.slots}
              onChange={(e) => set("slots", e.target.value)}
            />
          </Field>
          <Field label="Часов за участие" required error={errors.hours}>
            <input
              type="number"
              min={0.5}
              step={0.5}
              inputMode="decimal"
              className={inputClass}
              value={d.hours}
              onChange={(e) => set("hours", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Формат" group>
          <Chips options={FORMAT} value={[d.format]} onChange={([v]) => set("format", v)} />
        </Field>
        {d.format === "offline" && (
          <Field label="Регион" group>
            <Chips options={REGION} value={[d.region]} onChange={([v]) => set("region", v)} />
          </Field>
        )}
        <Field label={d.format === "online" ? "Где встречаемся" : "Адрес"} hint={d.format === "online" ? "Например: Zoom, ссылку пришлёт координатор." : undefined}>
          <input
            className={inputClass}
            value={d.place}
            onChange={(e) => set("place", e.target.value)}
            placeholder={d.format === "online" ? "Онлайн" : "Например: Мастерские, Дмитровский пер., 4"}
          />
        </Field>
      </Card>

      {saveError && <ErrorBox text={saveError} />}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving}>
          Создать занятие
        </Button>
        <Button variant="secondary" onClick={() => navigate("/admin/opportunities")}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
