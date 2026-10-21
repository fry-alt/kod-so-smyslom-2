// «Как всё устроено»: путь одной волонтёрки — анкета → знакомство и обучение → занятия.
// Шаги подсвечиваются по очереди, стрелка между ними прорисовывается в момент перехода (классы journey-* в index.css).
import type { ReactNode } from "react";

import { Arm, CLAY, FURNITURE, FURNITURE_DARK, HAIR, Person, SKIN } from "./VolunteerScenes";

/** Героиня всех трёх шагов — один и тот же человек. */
const HERO = { skin: SKIN.light, shirt: "var(--p-accent)", hair: HAIR.brown, style: "long" as const };

function Art(props: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 200 160" className="h-auto w-full" role="img" aria-label={props.label}>
      <ellipse cx="100" cy="146" rx="80" ry="6" fill="var(--p-ink)" opacity="0.06" />
      {props.children}
    </svg>
  );
}

/** 1. Заполняет анкету на телефоне: поля заполняются, появляется галочка. */
function FormArt() {
  return (
    <Art label="Волонтёрка заполняет анкету на телефоне">
      <Person x={62} y={68} {...HERO} />
      <rect x="74" y="88" width="15" height="24" rx="3" fill="#1f2430" />
      <rect x="76.5" y="91" width="10" height="16" rx="1.5" fill="var(--p-soft)" />
      <Arm from={[80, 96]} to={[80, 104]} skin={HERO.skin} />
      <rect x="108" y="30" width="76" height="104" rx="12" fill="#fff" stroke="var(--p-soft)" strokeWidth="2" />
      {[48, 66, 84].map((y, i) => (
        <g key={y}>
          <rect x="118" y={y} width="56" height="8" rx="4" fill="var(--p-surface)" />
          <rect className={`anim-fill anim-fill-${i + 1}`} x="118" y={y} width="56" height="8" rx="4" fill="var(--p-soft)" />
        </g>
      ))}
      <g className="anim-check">
        <circle cx="146" cy="112" r="11" fill="var(--p-accent)" />
        <path d="M140.5 112 l4 4 l7.5 -8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Art>
  );
}

/** 2. Встреча с координатором и короткий курс: полоска прогресса заполняется. */
function MeetArt() {
  return (
    <Art label="Волонтёрка знакомится с координатором и проходит обучение">
      <Person x={58} y={70} {...HERO} />
      <Person x={144} y={66} skin={SKIN.mid} shirt="var(--p-pop-2)" hair={HAIR.grey} style="bun" glasses />
      <rect x="28" y="114" width="144" height="9" rx="4" fill={FURNITURE_DARK} />
      <rect x="40" y="123" width="6" height="20" rx="2" fill={FURNITURE} />
      <rect x="154" y="123" width="6" height="20" rx="2" fill={FURNITURE} />
      <path d="M84 113 l14 -10 h8 l14 10Z" fill="#fff" stroke="var(--p-soft)" strokeWidth="1.5" />
      <Arm from={[74, 96]} to={[88, 108]} skin={HERO.skin} />
      <Arm from={[128, 92]} to={[114, 106]} skin={SKIN.mid} />
      <g className="anim-pulse">
        <rect x="74" y="14" width="52" height="30" rx="10" fill="#fff" stroke="var(--p-soft)" strokeWidth="2" />
        <rect x="82" y="25" width="36" height="8" rx="4" fill="var(--p-surface)" />
        <rect className="anim-fill anim-fill-slow" x="82" y="25" width="36" height="8" rx="4" fill="var(--p-accent)" />
      </g>
    </Art>
  );
}

/** 3. На занятии: помогает ребёнку за гончарным кругом, над ними — сердечко. */
function ClassArt() {
  return (
    <Art label="Волонтёрка помогает ребёнку на мастер-классе">
      <rect x="74" y="124" width="52" height="12" rx="5" fill={FURNITURE} />
      <ellipse cx="100" cy="122" rx="28" ry="5" fill={FURNITURE_DARK} />
      <Person x={60} y={84} s={0.8} skin={SKIN.dark} shirt="var(--p-pop)" hair={HAIR.dark} style="curly" />
      <Person x={146} y={66} {...HERO} />
      <clipPath id="journey-pot">
        <path d="M88 121 Q84 107 92 101 Q100 96 108 101 Q116 107 112 121Z" />
      </clipPath>
      <path d="M88 121 Q84 107 92 101 Q100 96 108 101 Q116 107 112 121Z" fill={CLAY} />
      <g clipPath="url(#journey-pot)">
        <rect className="anim-spin" x="96" y="98" width="4" height="24" fill="#fff" opacity="0.35" />
      </g>
      <Arm from={[70, 104]} to={[89, 110]} skin={SKIN.dark} w={6} className="anim-bob" />
      <Arm from={[130, 92]} to={[112, 106]} skin={HERO.skin} className="anim-bob-late" />
      <path className="anim-pulse" d="M100 46 c-9 -6 -14 -10 -14 -15 a6 6 0 0 1 14 -3 a6 6 0 0 1 14 3 c0 5 -5 9 -14 15Z" fill="var(--p-pop-2)" />
    </Art>
  );
}

const STEPS = [
  { title: "Анкета", text: "Расскажите о себе и отметьте, когда вам удобно помогать.", art: <FormArt /> },
  { title: "Знакомство и обучение", text: "Встреча с координатором и короткий курс о наших подопечных.", art: <MeetArt /> },
  { title: "Занятия", text: "Выбираете подходящие мастер-классы и приходите — разово или постоянно.", art: <ClassArt /> },
];

/** Изогнутая стрелка между шагами. Направление «вверх» — к приподнятому среднему шагу, «вниз» — от него. */
function CurvedArrow(props: { up?: boolean; index: number; vertical?: boolean }) {
  const d = props.vertical
    ? "M30 6 C6 26 6 50 28 70"
    : props.up
      ? "M6 62 C20 14 60 6 88 30"
      : "M6 30 C34 6 74 14 88 62";
  const head = props.vertical ? "M20 64 L28 70 L32 60" : props.up ? "M76 28 L88 30 L84 18" : "M88 50 L88 62 L77 58";
  return (
    <svg
      viewBox={props.vertical ? "0 0 40 76" : "0 0 94 70"}
      className={props.vertical ? "h-16 w-10" : "w-full"}
      fill="none"
      aria-hidden="true"
    >
      <path d={d} stroke="var(--p-soft)" strokeWidth="4" strokeLinecap="round" />
      <path className={`journey-arrow journey-arrow-${props.index}`} pathLength={100} d={d} stroke="var(--p-accent)" strokeWidth="4" strokeLinecap="round" />
      <path className={`journey-head journey-head-${props.index}`} d={head} stroke="var(--p-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Step(props: { i: number; title: string; text: string; art: ReactNode; raised?: boolean }) {
  return (
    <li className={`flex flex-col gap-3 ${props.raised ? "md:-mt-8" : "md:mt-6"}`}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-display text-lg font-semibold text-accent-text">
          {props.i + 1}
        </span>
        <span className="font-display text-xl font-semibold leading-tight">{props.title}</span>
      </div>
      <div className={`journey-step journey-step-${props.i + 1} rounded-[1.75rem] bg-surface p-3`}>{props.art}</div>
      <p className="text-hint">{props.text}</p>
    </li>
  );
}

export default function Journey() {
  return (
    <section className="flex flex-col gap-8">
      <h2 className="font-display text-2xl font-semibold">Как всё устроено</h2>

      {/* ноутбук: шаги в ряд дугой, стрелки между ними */}
      <ol className="hidden grid-cols-[1fr_5.5rem_1fr_5.5rem_1fr] items-start md:grid">
        <Step i={0} {...STEPS[0]} />
        <li aria-hidden="true" className="mt-24 px-1">
          <CurvedArrow up index={1} />
        </li>
        <Step i={1} {...STEPS[1]} raised />
        <li aria-hidden="true" className="mt-24 px-1">
          <CurvedArrow index={2} />
        </li>
        <Step i={2} {...STEPS[2]} />
      </ol>

      {/* телефон: столбиком, стрелки сверху вниз */}
      <ol className="flex flex-col items-stretch md:hidden">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col items-center">
            <ul className="w-full">
              <Step i={i} {...s} />
            </ul>
            {i < STEPS.length - 1 && (
              <span className="py-1" aria-hidden="true">
                <CurvedArrow vertical index={i + 1} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
