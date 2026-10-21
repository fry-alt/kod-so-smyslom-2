// Стартовый экран волонтёра.
// Справа — сцены «что делают волонтёры» (VolunteerScenes.tsx).
// Ниже — ближайшие занятия, где нужны люди; если их нет — неделя «когда нужна помощь».
import { useEffect, useState } from "react";

import type { Opportunity } from "../../api";
import { backend } from "../../backend";
import { FORMAT, REGION } from "../../labels";
import { navigate } from "../../router";
import { tgUser } from "../../telegram";
import { FLAIR, flairHandlers } from "../../ui";
import Journey from "./Journey";
import VolunteerScenes from "./VolunteerScenes";


export default function Welcome() {
  return (
    <div className="flex flex-col gap-14 pb-6">
      <section className="grid items-center gap-8 md:grid-cols-[1fr_1.15fr] md:gap-12">
        <div className="flex flex-col gap-6">
          {tgUser && <p className="text-lg text-hint">{tgUser.first_name}, здравствуйте!</p>}
          <h1 className="font-display text-[2.1rem] leading-[1.12] font-semibold tracking-tight text-balance md:text-[3rem]">
            Станьте волонтёром творческих мастерских
          </h1>
          <p className="max-w-[36ch] text-lg text-hint md:text-xl">
            Керамика, живопись, валяние и кулинария вместе с ребятами из детских домов и взрослыми с особенностями
            развития.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryButton onClick={() => navigate("/form")}>Заполнить анкету</PrimaryButton>
            <span className="text-hint whitespace-nowrap sm:pl-2">Займёт 5–7 минут</span>
          </div>
        </div>
        <VolunteerScenes />
      </section>

      <Journey />

      <Upcoming />


      <section className="flex flex-col gap-5 rounded-[2rem] bg-surface p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <p className="max-w-[46ch] text-lg">
          Фонд «Дети Марии» больше 30 лет работает в Москве, Подмосковье, Ярославской области и Северной Осетии.
        </p>
        <button
          type="button"
          onClick={() => navigate("/ask")}
          {...flairHandlers}
          className={`btn-flair min-h-12 shrink-0 self-start rounded-full border-2 border-ink/15 px-6 font-semibold md:self-center ${FLAIR.secondary}`}
        >
          Спросить о фонде
        </button>
      </section>

    </div>
  );
}

function PrimaryButton(props: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      {...flairHandlers}
      className={`btn-flair min-h-14 rounded-full bg-cta px-8 text-lg font-bold whitespace-nowrap text-white shadow-[0_8px_24px_-8px_var(--p-cta)] ${FLAIR.cta}`}
    >
      {props.children}
    </button>
  );
}

// ===== Ближайшие занятия =====

function Upcoming() {
  const [list, setList] = useState<Opportunity[] | null>(null);

  useEffect(() => {
    const now = Date.now();
    backend
      .opportunities()
      .then((all) =>
        setList(
          all
            .filter((o) => new Date(o.starts_at).getTime() > now && o.slots - o.taken > 0)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .slice(0, 3),
        ),
      )
      .catch(() => setList([]));
  }, []);

  if (list === null) return null; // пока грузится — не дёргаем вёрстку
  if (list.length === 0) return <WeekNeed />;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-semibold">Ближайшие занятия, где нужна помощь</h2>
      <ul className="grid gap-4 md:grid-cols-3">
        {list.map((o) => {
          const d = new Date(o.starts_at);
          const left = o.slots - o.taken;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => navigate("/form")}
                className="flex h-full w-full gap-4 rounded-3xl border-2 border-line p-5 text-left transition hover:border-accent"
              >
                <span className="flex w-16 shrink-0 flex-col items-center rounded-2xl bg-soft py-2 text-ink">
                  <span className="font-display text-2xl font-semibold leading-none">{d.getDate()}</span>
                  <span className="text-sm">{d.toLocaleDateString("ru", { month: "short" }).replace(".", "")}</span>
                  <span className="text-sm text-hint">{d.toLocaleDateString("ru", { weekday: "short" })}</span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-lg leading-snug font-semibold">{o.title}</span>
                  <span className="text-hint">
                    {d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })},{" "}
                    {o.format === "online" ? FORMAT.online.toLowerCase() : o.place || REGION[o.region]}
                  </span>
                  <span className="mt-1 self-start rounded-full bg-pop px-3 py-0.5 text-sm font-semibold text-ink">
                    {left === 1 ? "Нужен ещё 1 человек" : `Нужно ещё ${left} человек${left < 5 ? "а" : ""}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Если открытых занятий нет: неделя, где видно, когда помощь нужна больше всего. */
function WeekNeed() {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  // 2 — нужно больше всего, 1 — нужно, 0 — редко
  const need = [2, 2, 2, 2, 2, 1, 0];
  return (
    <section className="flex flex-col gap-5">
      <h2 className="font-display text-2xl font-semibold">Когда нужна помощь</h2>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
        {days.map((d, i) => (
          <div key={d} className="flex flex-col items-center gap-2">
            <div
              className={`h-20 w-full rounded-2xl sm:h-24 ${
                need[i] === 2 ? "bg-accent" : need[i] === 1 ? "bg-pop" : "bg-surface"
              }`}
            />
            <span className="font-medium">{d}</span>
          </div>
        ))}
      </div>
      <p className="max-w-[60ch] text-lg text-hint">
        <span className="font-semibold text-ink">Больше всего рук не хватает в будни днём</span> — группы из
        интернатов приезжают утром. По субботам открыты инклюзивные мастерские.
      </p>
    </section>
  );
}
