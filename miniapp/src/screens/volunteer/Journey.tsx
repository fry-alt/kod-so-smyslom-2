// «Как всё устроено»: путь одной волонтёрки — анкета → знакомство и обучение → занятия.
// Шаги подсвечиваются по очереди, стрелка между ними прорисовывается в момент перехода (классы journey-* в index.css).
// Иллюстрации — JourneyArt.tsx.
import { useEffect, useRef, useState, type ReactNode } from "react";

import { FundNumber, type NumberTone } from "../../ui";
import { StepFormIllustration, StepLessonsIllustration, StepTrainingIllustration } from "./JourneyArt";

const STEPS = [
  { title: "Анкета", text: "Расскажите о себе и отметьте, когда вам удобно помогать.", art: <StepFormIllustration /> },
  { title: "Обучение и знакомство", text: "Короткий курс о наших подопечных, потом встреча с координатором.", art: <StepTrainingIllustration /> },
  { title: "Занятия", text: "Выбираете подходящие мастер-классы и приходите — разово или постоянно.", art: <StepLessonsIllustration /> },
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

/** Номера шагов — цифры на пастельных кругах, как на сайте фонда. */
const STEP_TONES: NumberTone[] = ["blue", "yellow", "green"];

function Step(props: { i: number; title: string; text: string; art: ReactNode; raised?: boolean }) {
  return (
    <li className={`flex min-w-0 flex-col gap-3 ${props.raised ? "md:-mt-8" : "md:mt-6"}`}>
      {/* на узком ноутбуке колонки тесные: номер над заголовком, слова переносятся по слогам, а не по буквам */}
      <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-2 lg:flex-row lg:items-center lg:gap-3">
        <FundNumber tone={STEP_TONES[props.i]} className="w-12 shrink-0 text-center text-4xl">
          {props.i + 1}
        </FundNumber>
        <span className="min-w-0 font-display text-xl leading-tight font-semibold hyphens-auto md:text-lg lg:text-xl">{props.title}</span>
      </div>
      <div className={`journey-step journey-step-${props.i + 1} rounded-[1.75rem] bg-surface p-3`}>{props.art}</div>
      <p className="text-hint">{props.text}</p>
    </li>
  );
}

export default function Journey() {
  // Шаги начинают загораться, когда блок появился на экране (а не пока человек читает заголовок наверху).
  const ref = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return setPlaying(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className={`journey flex flex-col gap-8 ${playing ? "is-playing" : ""}`}>
      <h2 className="font-display text-2xl font-semibold">Как всё устроено</h2>

      {/* ноутбук: шаги в ряд дугой, стрелки между ними */}
      <ol className="hidden grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-start md:grid">
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
