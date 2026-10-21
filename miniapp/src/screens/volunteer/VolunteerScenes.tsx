// Четыре сцены «что делают волонтёры фонда» — по тому, как фонд сам описывает помощь.
// Персонажи собраны из простых фигур; цвета одежды — из палитры (var(--p-…)), движения — классы anim-* в index.css.
// При «уменьшении движения» в системе анимации выключаются.
import type { ReactNode } from "react";

export const SKIN = { light: "#f2c7a5", mid: "#c98e6b", dark: "#8d5a3b" };
export const HAIR = { grey: "#c9ccd3", brown: "#6b4a3a", dark: "#1f2430" };
export const FURNITURE = "var(--p-soft)";
export const FURNITURE_DARK = "color-mix(in srgb, var(--p-accent) 35%, var(--p-soft))";
export const CLAY = "#c98a5e";

type HairStyle = "bun" | "short" | "long" | "curly" | "beanie";

/** Человечек: (x, y) — центр головы, s — масштаб (ребёнок ≈ 0.8). */
export function Person(props: {
  x: number;
  y: number;
  s?: number;
  skin: string;
  shirt: string;
  hair: string;
  style: HairStyle;
  glasses?: boolean;
  headClass?: string;
}) {
  const { x, y, skin, shirt, hair, style } = props;
  const s = props.s ?? 1;
  const r = 14 * s;
  const cap = `M${x - r} ${y - 1} A${r} ${r} 0 0 1 ${x + r} ${y - 1} Q${x} ${y - 9 * s} ${x - r} ${y - 1}Z`;
  return (
    <g>
      {style === "long" && <rect x={x - r - 1} y={y - 6 * s} width={2 * r + 2} height={28 * s} rx={10 * s} fill={hair} />}
      <rect x={x - 25 * s} y={y + 12 * s} width={50 * s} height={46 * s} rx={22 * s} fill={shirt} />
      <g className={props.headClass}>
        <circle cx={x} cy={y} r={r} fill={skin} />
        <circle cx={x - 5 * s} cy={y + 1} r={1.5 * s} fill="#1f2430" />
        <circle cx={x + 5 * s} cy={y + 1} r={1.5 * s} fill="#1f2430" />
        <path d={`M${x - 4 * s} ${y + 6 * s} Q${x} ${y + 9 * s} ${x + 4 * s} ${y + 6 * s}`} stroke="#1f2430" strokeWidth={1.4 * s} fill="none" strokeLinecap="round" />
        {props.glasses && (
          <g stroke="#1f2430" strokeWidth={1.3 * s} fill="none">
            <circle cx={x - 5 * s} cy={y + 1} r={4 * s} />
            <circle cx={x + 5 * s} cy={y + 1} r={4 * s} />
            <path d={`M${x - 1 * s} ${y + 1}h${2 * s}`} />
          </g>
        )}
        {style === "bun" && <circle cx={x} cy={y - 16 * s} r={6 * s} fill={hair} />}
        {(style === "bun" || style === "short" || style === "long") && <path d={cap} fill={hair} />}
        {style === "curly" &&
          [-10, -4, 3, 9].map((dx, i) => <circle key={i} cx={x + dx * s} cy={y - (i % 2 ? 12 : 10) * s} r={6 * s} fill={hair} />)}
        {style === "beanie" && (
          <>
            <path d={cap} fill={hair} transform={`translate(0 ${-2 * s})`} />
            <circle cx={x} cy={y - 17 * s} r={3.5 * s} fill={hair} />
          </>
        )}
      </g>
    </g>
  );
}

export function Arm(props: { from: [number, number]; to: [number, number]; skin: string; w?: number; className?: string }) {
  return (
    <path
      className={props.className}
      d={`M${props.from[0]} ${props.from[1]} L${props.to[0]} ${props.to[1]}`}
      stroke={props.skin}
      strokeWidth={props.w ?? 7}
      strokeLinecap="round"
    />
  );
}

function Scene(props: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 200 160" className="h-auto w-full" role="img" aria-label={props.label}>
      <ellipse cx="100" cy="146" rx="80" ry="6" fill="var(--p-ink)" opacity="0.06" />
      {props.children}
    </svg>
  );
}

/** 1. Помощник на мастер-классе: рядом с ребёнком за гончарным кругом. */
function Masterclass() {
  return (
    <Scene label="Волонтёр помогает ребёнку на гончарном круге">
      <rect x="74" y="124" width="52" height="12" rx="5" fill={FURNITURE} />
      <ellipse cx="100" cy="122" rx="28" ry="5" fill={FURNITURE_DARK} />
      <Person x={60} y={84} s={0.8} skin={SKIN.dark} shirt="var(--p-pop)" hair={HAIR.dark} style="curly" />
      <Person x={146} y={66} skin={SKIN.light} shirt="var(--p-accent)" hair={HAIR.grey} style="bun" />
      <clipPath id="pot">
        <path d="M88 121 Q84 107 92 101 Q100 96 108 101 Q116 107 112 121Z" />
      </clipPath>
      <path d="M88 121 Q84 107 92 101 Q100 96 108 101 Q116 107 112 121Z" fill={CLAY} />
      <g clipPath="url(#pot)">
        <rect className="anim-spin" x="96" y="98" width="4" height="24" fill="#fff" opacity="0.35" />
      </g>
      <Arm from={[70, 104]} to={[89, 110]} skin={SKIN.dark} w={6} className="anim-bob" />
      <Arm from={[130, 92]} to={[112, 106]} skin={SKIN.light} className="anim-bob-late" />
    </Scene>
  );
}

/** 2. Значимый взрослый: разговор на скамейке. */
function Mentor() {
  return (
    <Scene label="Взрослый волонтёр разговаривает с подростком на скамейке">
      <rect x="44" y="124" width="6" height="18" rx="2" fill={FURNITURE_DARK} />
      <rect x="150" y="124" width="6" height="18" rx="2" fill={FURNITURE_DARK} />
      <Person x={76} y={70} skin={SKIN.mid} shirt="var(--p-pop-2)" hair={HAIR.dark} style="short" />
      <Person x={128} y={80} s={0.85} skin={SKIN.light} shirt="var(--p-accent)" hair={HAIR.brown} style="long" headClass="anim-nod" />
      <rect x="36" y="118" width="128" height="9" rx="4" fill={FURNITURE} />
      <Arm from={[94, 96]} to={[110, 94]} skin={SKIN.mid} />
      <g className="anim-pulse">
        <rect x="84" y="14" width="40" height="28" rx="12" fill="#fff" stroke="var(--p-soft)" strokeWidth="2" />
        <path d="M96 41 l-4 8 l10 -7" fill="#fff" />
        <path d="M104 34 c-6 -4 -9 -7 -9 -10 a4 4 0 0 1 9 -2 a4 4 0 0 1 9 2 c0 3 -3 6 -9 10Z" fill="var(--p-pop-2)" />
      </g>
    </Scene>
  );
}

/** 3. Специалист — психолог, логопед, юрист: консультация за столом. */
function Specialist() {
  return (
    <Scene label="Волонтёр-специалист консультирует подростка за столом">
      <Person x={60} y={66} skin={SKIN.light} shirt="var(--p-accent)" hair={HAIR.brown} style="short" glasses />
      <Person x={144} y={76} s={0.85} skin={SKIN.dark} shirt="var(--p-pop)" hair={HAIR.dark} style="curly" />
      <rect x="28" y="112" width="144" height="9" rx="4" fill={FURNITURE_DARK} />
      <rect x="40" y="121" width="6" height="22" rx="2" fill={FURNITURE} />
      <rect x="154" y="121" width="6" height="22" rx="2" fill={FURNITURE} />
      <rect x="72" y="103" width="28" height="9" rx="2" fill="#fff" />
      <path d="M78 107h14" stroke={FURNITURE_DARK} strokeWidth="1.5" strokeLinecap="round" />
      <g className="anim-talk-a">
        <rect x="70" y="14" width="40" height="24" rx="11" fill="#fff" stroke="var(--p-soft)" strokeWidth="2" />
        <path d="M78 37 l-3 8 l10 -7" fill="#fff" />
        {[82, 90, 98].map((cx) => (
          <circle key={cx} cx={cx} cy="26" r="2.6" fill="var(--p-accent)" />
        ))}
      </g>
      <g className="anim-talk-b">
        <rect x="118" y="24" width="40" height="24" rx="11" fill="#fff" stroke="var(--p-soft)" strokeWidth="2" />
        <path d="M146 47 l3 8 l-10 -7" fill="#fff" />
        {[130, 138, 146].map((cx) => (
          <circle key={cx} cx={cx} cy="36" r="2.6" fill="var(--p-pop)" />
        ))}
      </g>
    </Scene>
  );
}

/** 4. Ярмарки и фото: прилавок с работами мастерских и волонтёр с фотоаппаратом. */
function FairAndPhoto() {
  return (
    <Scene label="Волонтёр фотографирует прилавок благотворительной ярмарки">
      <path d="M22 50 v86 M108 50 v86" stroke={FURNITURE_DARK} strokeWidth="4" strokeLinecap="round" />
      <rect x="16" y="38" width="98" height="16" rx="6" fill="var(--p-pop)" />
      {[26, 42, 58, 74, 90, 104].map((cx) => (
        <circle key={cx} cx={cx} cy="54" r="7" fill="var(--p-pop)" />
      ))}
      <Person x={64} y={78} s={0.9} skin={SKIN.mid} shirt="var(--p-pop-2)" hair={HAIR.brown} style="long" />
      <rect x="18" y="106" width="94" height="34" rx="6" fill="var(--p-soft)" />
      <path d="M32 106 q9 12 18 0Z" fill={CLAY} />
      <circle cx="76" cy="98" r="8" fill="var(--p-accent)" />
      <circle cx="70" cy="91" r="3" fill="var(--p-accent)" />
      <circle cx="82" cy="91" r="3" fill="var(--p-accent)" />
      <rect x="92" y="94" width="12" height="12" rx="3" fill="#fff" />
      <Person x={160} y={66} skin={SKIN.dark} shirt="var(--p-accent)" hair="var(--p-pop-2)" style="beanie" />
      <Arm from={[146, 92]} to={[136, 90]} skin={SKIN.dark} />
      <rect x="118" y="80" width="24" height="17" rx="4" fill="#1f2430" />
      <circle cx="128" cy="88.5" r="5" fill="#fff" />
      <circle cx="128" cy="88.5" r="2.6" fill="#1f2430" />
      <path className="anim-flash" d="M112 70 l3 6 l6 -1 l-4 5 l4 5 l-6 -1 l-3 6 l-2 -6 l-6 1 l4 -5 l-4 -5 l6 1Z" fill="var(--p-pop)" />
    </Scene>
  );
}

const SCENES = [
  { title: "Помощь на мастер-классах", sub: "Керамика, живопись, валяние, кулинария", art: <Masterclass /> },
  { title: "Наставничество", sub: "Стать значимым взрослым для ребят", art: <Mentor /> },
  { title: "Помощь специалистов", sub: "Психолог, логопед, юрист", art: <Specialist /> },
  { title: "Ярмарки и фото", sub: "Маркеты фонда, съёмка, соцсети", art: <FairAndPhoto /> },
];

export default function VolunteerScenes() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="Чем помогают волонтёры">
      {SCENES.map((s, i) => (
        <li
          key={s.title}
          className="tile-in flex flex-col gap-2 rounded-[1.75rem] bg-surface p-3 pb-4 sm:p-4"
          style={{ animationDelay: `${100 + i * 100}ms` }}
        >
          {s.art}
          <div className="px-1">
            <p className="leading-snug font-semibold">{s.title}</p>
            <p className="text-sm leading-snug text-hint">{s.sub}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
