// Сцены «что делают волонтёры фонда» — по тому, как фонд сам описывает помощь.
// Нарисованы как детский рисунок из мастерских фонда: акварельный фон (класс kid-art в index.css), яркие гуашевые цвета,
// чуть кривые контуры фломастером и узоры на одежде. Контуры «дрожат» по формуле, а не случайно, — картинка не прыгает
// между рендерами. Движения — классы anim-* в index.css; при «уменьшении движения» в системе они выключаются.
import type { ReactNode } from "react";

export const SKIN = { light: "#f6c9a4", mid: "#d99a6c", dark: "#9a5f3c" };
export const HAIR = { grey: "#c9ccd3", brown: "#7a4a2e", dark: "#2b2140" };
/** Гуашь и фломастеры: яркие цвета для одежды и предметов. */
export const KID = {
  red: "#ef4136",
  orange: "#ff8a1f",
  yellow: "#ffd23f",
  green: "#3dbb5d",
  teal: "#14a8a0",
  blue: "#2d6fe0",
  violet: "#8b55d6",
  pink: "#ff5d8f",
};
/** Цвет контура — тёмный фломастер. */
export const INK = "#2b2140";
export const FURNITURE = "#f7b955";
export const FURNITURE_DARK = "#c46d34";
export const CLAY = "#d9773f";

type HairStyle = "bun" | "short" | "long" | "curly" | "beanie";
type Pattern = "stripes" | "dots" | "zigzag" | "flowers";
type Point = [number, number];

/** «Дрожь руки»: смещение от -amp до amp, всегда одно и то же для одного seed. */
function jit(seed: number, amp: number): number {
  const v = Math.sin(seed * 12.9898) * 43758.5453;
  return (v - Math.floor(v) - 0.5) * 2 * amp;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Замкнутый плавный контур через точки (кривые Безье по Катмуллу — Рому), каждая точка чуть сдвинута. */
function smooth(points: Point[], seed: number, amp: number): string {
  const p = points.map(([x, y], i): Point => [x + jit(seed + i * 3.1, amp), y + jit(seed + i * 5.7, amp)]);
  const n = p.length;
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [p[(i - 1 + n) % n], p[i], p[(i + 1) % n], p[(i + 2) % n]];
    d += ` C${r1(b[0] + (c[0] - a[0]) / 6)} ${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)} ${r1(c[1] - (e[1] - b[1]) / 6)} ${r1(c[0])} ${r1(c[1])}`;
  }
  return d + "Z";
}

/** Кривой «от руки» круг. */
function blob(cx: number, cy: number, r: number, seed: number): string {
  const pts: Point[] = Array.from({ length: 8 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 4), cy + r * Math.sin((i * Math.PI) / 4)]);
  return smooth(pts, seed, r * 0.07);
}

const DECO = ["#ffffff", KID.yellow, KID.pink, "#7fe3ff"];
const PATTERNS: Pattern[] = ["stripes", "dots", "zigzag", "flowers"];

/** Узор на кофте, как рисуют дети: полоски, горох, зигзаг или цветочки. */
function ShirtPattern(props: { x: number; y: number; s: number; pattern: Pattern; color: string }) {
  const { x, y, s, color } = props;
  if (props.pattern === "stripes")
    return (
      <g stroke={color} strokeWidth={2.4 * s} fill="none" strokeLinecap="round">
        {[29, 39, 49].map((dy, i) => (
          <path key={dy} d={`M${x - (18 + i * 2) * s} ${y + dy * s} q${(9 + i) * s} ${-3 * s} ${(18 + i * 2) * s} 0 t${(18 + i * 2) * s} 0`} />
        ))}
      </g>
    );
  if (props.pattern === "dots")
    return (
      <g fill={color} stroke="none">
        {([[-12, 27], [3, 25], [14, 33], [-6, 38], [8, 45], [-16, 48], [18, 50], [-2, 52]] as Point[]).map(([dx, dy]) => (
          <circle key={`${dx}${dy}`} cx={x + dx * s} cy={y + dy * s} r={2 * s} />
        ))}
      </g>
    );
  if (props.pattern === "zigzag")
    return (
      <g stroke={color} strokeWidth={2.2 * s} fill="none" strokeLinejoin="round" strokeLinecap="round">
        <path d={`M${x - 19 * s} ${y + 34 * s} l${5 * s} ${-6 * s} l${5 * s} ${6 * s} l${5 * s} ${-6 * s} l${5 * s} ${6 * s} l${5 * s} ${-6 * s} l${5 * s} ${6 * s} l${5 * s} ${-6 * s} l${4 * s} ${6 * s}`} />
        <path d={`M${x - 21 * s} ${y + 47 * s} h${42 * s}`} strokeDasharray={`${3 * s} ${3 * s}`} />
      </g>
    );
  return (
    <g stroke="none">
      {([[-10, 32], [9, 44]] as Point[]).map(([dx, dy]) => (
        <g key={dx}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={x + (dx + 3.2 * Math.cos((a * Math.PI) / 180)) * s} cy={y + (dy + 3.2 * Math.sin((a * Math.PI) / 180)) * s} r={2.3 * s} fill={color} />
          ))}
          <circle cx={x + dx * s} cy={y + dy * s} r={1.8 * s} fill={KID.orange} />
        </g>
      ))}
    </g>
  );
}

/** Человечек: (x, y) — центр головы, s — масштаб (ребёнок ≈ 0.8). legs — ноги в ботинках (для тех, кто стоит). */
export function Person(props: {
  x: number;
  y: number;
  s?: number;
  skin: string;
  shirt: string;
  hair: string;
  style: HairStyle;
  glasses?: boolean;
  legs?: boolean;
  pattern?: Pattern;
  deco?: string;
  headClass?: string;
}) {
  const { x, y, skin, shirt, hair, style } = props;
  const s = props.s ?? 1;
  const r = 14 * s;
  const seed = x * 7 + y * 13;
  const pattern = props.pattern ?? PATTERNS[Math.round(seed) % PATTERNS.length];
  const deco = props.deco ?? DECO[Math.round(seed / 3) % DECO.length];
  const line = { stroke: INK, strokeWidth: 1.4 * s, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  const body = smooth(
    ([[-11, 12], [11, 12], [19, 17], [23, 34], [26, 57], [0, 59], [-26, 57], [-23, 34], [-19, 17]] as Point[]).map(([dx, dy]) => [x + dx * s, y + dy * s]),
    seed,
    1.1 * s,
  );
  // чёлка зубчиками справа налево
  const fringe = Array.from({ length: 6 }, (_, k) => `L${r1(x + r - (k + 0.5) * ((2 * r) / 6))} ${r1(y - (k % 2 ? 2 : 6) * s)}`).join(" ");
  const cap = `M${x - r - 1} ${y + 1} C${x - r - 1} ${y - r - 6 * s} ${x + r + 1} ${y - r - 6 * s} ${x + r + 1} ${y + 1} ${fringe} Z`;
  const hat = `M${x - r - 1} ${y - 2 * s} C${x - r - 1} ${y - r - 8 * s} ${x + r + 1} ${y - r - 8 * s} ${x + r + 1} ${y - 2 * s} Z`;

  return (
    <g>
      {props.legs && (
        <g {...line}>
          <path d={`M${x - 9 * s} ${y + 56 * s} l${-2 * s} ${18 * s}`} strokeWidth={3 * s} />
          <path d={`M${x + 9 * s} ${y + 56 * s} l${2 * s} ${18 * s}`} strokeWidth={3 * s} />
          <ellipse cx={x - 13 * s} cy={y + 75 * s} rx={5 * s} ry={3 * s} fill={KID.red} />
          <ellipse cx={x + 13 * s} cy={y + 75 * s} rx={5 * s} ry={3 * s} fill={KID.red} />
        </g>
      )}
      {style === "long" && (
        <path
          d={smooth(([[-r - 1, -8 * s], [-r - 4 * s, 8 * s], [-r - 3 * s, 24 * s], [r + 3 * s, 24 * s], [r + 4 * s, 8 * s], [r + 1, -8 * s], [0, -r - 4 * s]] as Point[]).map(([dx, dy]) => [x + dx, y + dy]), seed + 9, s)}
          fill={hair}
          {...line}
        />
      )}
      <path d={body} fill={shirt} stroke="none" transform={`translate(${1.2 * s} ${0.9 * s})`} />
      <ShirtPattern x={x} y={y} s={s} pattern={pattern} color={deco} />
      <path d={body} fill="none" {...line} />
      <path d={`M${x - 6 * s} ${y + 13 * s} Q${x} ${y + 19 * s} ${x + 6 * s} ${y + 13 * s}`} fill="none" {...line} />
      <g className={props.headClass}>
        <circle cx={x - r} cy={y + 1} r={3.4 * s} fill={skin} {...line} />
        <circle cx={x + r} cy={y + 1} r={3.4 * s} fill={skin} {...line} />
        <path d={blob(x, y, r, seed + 4)} fill={skin} {...line} />
        {style === "bun" && (
          <>
            <path d={blob(x, y - 17 * s, 6 * s, seed + 2)} fill={hair} {...line} />
            <path d={`M${x} ${y - 17 * s} m${-2 * s} 0 a${2 * s} ${2 * s} 0 1 1 ${3 * s} ${1.5 * s}`} fill="none" {...line} strokeWidth={0.9 * s} />
            <path d={`M${x - 1 * s} ${y - 12 * s} l${-7 * s} ${-4 * s} l${1 * s} ${8 * s}Z M${x + 1 * s} ${y - 12 * s} l${7 * s} ${-4 * s} l${-1 * s} ${8 * s}Z`} fill={KID.pink} {...line} strokeWidth={1 * s} />
          </>
        )}
        {(style === "short" || style === "long" || style === "bun") && <path d={cap} fill={hair} {...line} />}
        {style === "curly" &&
          ([[-13, -4], [-9, -11], [-2, -14], [5, -13], [11, -9], [14, -2]] as Point[]).map(([dx, dy], i) => (
            <path key={i} d={blob(x + dx * s, y + dy * s, 5.5 * s, seed + i)} fill={hair} {...line} strokeWidth={1.1 * s} />
          ))}
        {style === "beanie" && (
          <>
            <path d={blob(x, y - 19 * s, 4 * s, seed + 1)} fill={KID.yellow} {...line} />
            <path d={hat} fill={hair} {...line} />
            <path d={`M${x - r + 3 * s} ${y - 9 * s} q${r - 3 * s} ${-3 * s} ${2 * r - 6 * s} 0 M${x - r + 6 * s} ${y - 15 * s} q${r - 6 * s} ${-3 * s} ${2 * r - 12 * s} 0`} fill="none" stroke={KID.yellow} strokeWidth={2 * s} strokeLinecap="round" />
            <rect x={x - r - 2 * s} y={y - 4 * s} width={2 * r + 4 * s} height={5 * s} rx={2 * s} fill={hair} {...line} />
          </>
        )}
        <circle cx={x - 5 * s} cy={y + 1.5 * s} r={1.8 * s} fill={INK} stroke="none" />
        <circle cx={x + 5 * s} cy={y + 1.5 * s} r={1.8 * s} fill={INK} stroke="none" />
        <circle cx={x - 8.5 * s} cy={y + 6 * s} r={2.6 * s} fill={KID.pink} opacity="0.45" stroke="none" />
        <circle cx={x + 8.5 * s} cy={y + 6 * s} r={2.6 * s} fill={KID.pink} opacity="0.45" stroke="none" />
        <path d={`M${x - 4.5 * s} ${y + 6 * s} Q${x} ${y + 12 * s} ${x + 4.5 * s} ${y + 6 * s}Z`} fill={KID.red} {...line} strokeWidth={1.1 * s} />
        {props.glasses && (
          <g {...line} fill="#fff" fillOpacity="0.3">
            <circle cx={x - 5 * s} cy={y + 1.5 * s} r={4 * s} />
            <circle cx={x + 5 * s} cy={y + 1.5 * s} r={4 * s} />
            <path d={`M${x - 1 * s} ${y + 1.5 * s}h${2 * s}`} />
          </g>
        )}
      </g>
    </g>
  );
}

/** Рука: толстая линия цвета кожи с контуром фломастером и ладошкой на конце. */
export function Arm(props: { from: Point; to: Point; skin: string; w?: number; className?: string }) {
  const w = props.w ?? 7;
  const d = `M${props.from[0]} ${props.from[1]} L${props.to[0]} ${props.to[1]}`;
  return (
    <g className={props.className}>
      <path d={d} stroke={INK} strokeWidth={w + 2.6} strokeLinecap="round" />
      <path d={d} stroke={props.skin} strokeWidth={w} strokeLinecap="round" />
      <circle cx={props.to[0]} cy={props.to[1]} r={w * 0.62} fill={props.skin} stroke={INK} strokeWidth="1.3" />
    </g>
  );
}

/** Трава фломастером внизу каждой картинки — как у детей «земля» под ногами. */
function Grass() {
  return (
    <g fill="none" strokeLinecap="round" stroke="none">
      <path d="M6 151 q12 -4 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" stroke={KID.green} strokeWidth="3" />
      <path d="M14 150 l2 -6 M40 151 l-1 -6 M70 150 l2 -6 M132 151 l-2 -6 M164 150 l2 -6 M186 151 l-1 -5" stroke={KID.green} strokeWidth="1.5" />
      <circle cx="24" cy="145" r="2.2" fill={KID.pink} />
      <circle cx="176" cy="145" r="2.2" fill={KID.yellow} />
    </g>
  );
}

/** Солнце с лучами-палочками, как его рисуют дети. */
function Sun(props: { x: number; y: number; r?: number }) {
  const r = props.r ?? 10;
  return (
    <g className="anim-pulse">
      <path
        d={Array.from({ length: 10 }, (_, i) => {
          const a = (i * Math.PI) / 5;
          return `M${r1(props.x + (r + 3) * Math.cos(a))} ${r1(props.y + (r + 3) * Math.sin(a))} L${r1(props.x + (r + 8) * Math.cos(a))} ${r1(props.y + (r + 8) * Math.sin(a))}`;
        }).join(" ")}
        stroke={KID.orange}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d={blob(props.x, props.y, r, props.x)} fill={KID.yellow} stroke={INK} strokeWidth="1.3" />
    </g>
  );
}

/** Птички-«галочки» в небе. */
function Birds(props: { at: Point[] }) {
  return (
    <path
      d={props.at.map(([x, y]) => `M${x} ${y} q3 -4 6 0 q3 -4 6 0`).join(" ")}
      stroke={INK}
      strokeWidth="1.4"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Рамка картинки: акварельный фон и трава. Сдвиг фона — от подписи, чтобы у каждой сцены свои разводы. */
export function KidArt(props: { label: string; children: ReactNode }) {
  const h = [...props.label].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7);
  return (
    <svg
      viewBox="0 0 200 160"
      className="kid-art h-auto w-full"
      style={{ backgroundPosition: `${(h % 5) * 25}% ${(h % 3) * 50}%` }}
      role="img"
      aria-label={props.label}
    >
      <Grass />
      {props.children}
    </svg>
  );
}


/** 1. Помощник на мастер-классе: рядом с ребёнком за гончарным кругом. */
function Masterclass() {
  return (
    <KidArt label="Волонтёр помогает ребёнку на гончарном круге">
      <Birds at={[[18, 22], [36, 14]]} />
      <rect x="74" y="124" width="52" height="12" rx="5" fill={FURNITURE} />
      <ellipse cx="100" cy="122" rx="28" ry="5" fill={FURNITURE_DARK} />
      <Person x={60} y={84} s={0.8} skin={SKIN.dark} shirt={KID.yellow} hair={HAIR.dark} style="curly" />
      <Person x={146} y={66} skin={SKIN.light} shirt={KID.green} hair={HAIR.grey} style="bun" />
      <clipPath id="pot">
        <path d="M88 121 Q84 107 92 101 Q100 96 108 101 Q116 107 112 121Z" />
      </clipPath>
      <path d="M88 121 Q84 107 92 101 Q100 96 108 101 Q116 107 112 121Z" fill={CLAY} />
      <g clipPath="url(#pot)">
        <rect className="anim-spin" x="96" y="98" width="4" height="24" fill="#fff" opacity="0.35" />
      </g>
      <Arm from={[70, 104]} to={[89, 110]} skin={SKIN.dark} w={6} className="anim-bob" />
      <Arm from={[130, 92]} to={[112, 106]} skin={SKIN.light} className="anim-bob-late" />
    </KidArt>
  );
}

/** 2. Значимый взрослый: разговор на скамейке. */
function Mentor() {
  return (
    <KidArt label="Взрослый волонтёр разговаривает с подростком на скамейке">
      <rect x="44" y="124" width="6" height="18" rx="2" fill={FURNITURE_DARK} />
      <rect x="150" y="124" width="6" height="18" rx="2" fill={FURNITURE_DARK} />
      <Person x={76} y={70} skin={SKIN.mid} shirt={KID.orange} hair={HAIR.dark} style="short" />
      <Person x={128} y={80} s={0.85} skin={SKIN.light} shirt={KID.green} hair={HAIR.brown} style="long" headClass="anim-nod" />
      <rect x="36" y="118" width="128" height="9" rx="4" fill={FURNITURE} />
      <Arm from={[94, 96]} to={[110, 94]} skin={SKIN.mid} />
      <g className="anim-pulse">
        <rect x="84" y="14" width="40" height="28" rx="12" fill="#fff" stroke={INK} strokeWidth="1.5" />
        <path d="M96 41 l-4 8 l10 -7" fill="#fff" />
        <path d="M104 34 c-6 -4 -9 -7 -9 -10 a4 4 0 0 1 9 -2 a4 4 0 0 1 9 2 c0 3 -3 6 -9 10Z" fill={KID.red} />
      </g>
    </KidArt>
  );
}

/** 3. Специалист — психолог, логопед, юрист: консультация за столом. */
function Specialist() {
  return (
    <KidArt label="Волонтёр-специалист консультирует подростка за столом">
      <Person x={60} y={66} skin={SKIN.light} shirt={KID.green} hair={HAIR.brown} style="short" glasses />
      <Person x={144} y={76} s={0.85} skin={SKIN.dark} shirt={KID.teal} hair={HAIR.dark} style="curly" />
      <rect x="28" y="112" width="144" height="9" rx="4" fill={FURNITURE_DARK} />
      <rect x="40" y="121" width="6" height="22" rx="2" fill={FURNITURE} />
      <rect x="154" y="121" width="6" height="22" rx="2" fill={FURNITURE} />
      <rect x="72" y="103" width="28" height="9" rx="2" fill="#fff" />
      <path d="M78 107h14" stroke={FURNITURE_DARK} strokeWidth="1.5" strokeLinecap="round" />
      <g className="anim-talk-a">
        <rect x="70" y="14" width="40" height="24" rx="11" fill="#fff" stroke={INK} strokeWidth="1.5" />
        <path d="M78 37 l-3 8 l10 -7" fill="#fff" />
        {[82, 90, 98].map((cx) => (
          <circle key={cx} cx={cx} cy="26" r="2.6" fill={KID.green} />
        ))}
      </g>
      <g className="anim-talk-b">
        <rect x="118" y="24" width="40" height="24" rx="11" fill="#fff" stroke={INK} strokeWidth="1.5" />
        <path d="M146 47 l3 8 l-10 -7" fill="#fff" />
        {[130, 138, 146].map((cx) => (
          <circle key={cx} cx={cx} cy="36" r="2.6" fill={KID.yellow} />
        ))}
      </g>
    </KidArt>
  );
}

/** 4. Ярмарки и фото: прилавок с работами мастерских и волонтёр с фотоаппаратом. */
function FairAndPhoto() {
  return (
    <KidArt label="Волонтёр фотографирует прилавок благотворительной ярмарки">
      <path d="M22 50 v86 M108 50 v86" stroke={FURNITURE_DARK} strokeWidth="4" strokeLinecap="round" />
      <rect x="16" y="38" width="98" height="16" rx="6" fill={KID.yellow} />
      {[26, 42, 58, 74, 90, 104].map((cx) => (
        <circle key={cx} cx={cx} cy="54" r="7" fill={KID.yellow} />
      ))}
      <Person x={64} y={78} s={0.9} skin={SKIN.mid} shirt={KID.orange} hair={HAIR.brown} style="long" />
      <rect x="18" y="106" width="94" height="34" rx="6" fill="#a8d8ff" />
      <path d="M32 106 q9 12 18 0Z" fill={CLAY} />
      <circle cx="76" cy="98" r="8" fill={KID.green} />
      <circle cx="70" cy="91" r="3" fill={KID.green} />
      <circle cx="82" cy="91" r="3" fill={KID.green} />
      <rect x="92" y="94" width="12" height="12" rx="3" fill="#fff" />
      <Person x={160} y={66} skin={SKIN.dark} shirt={KID.blue} hair={KID.pink} style="beanie" />
      <Arm from={[146, 92]} to={[136, 90]} skin={SKIN.dark} />
      <rect x="118" y="80" width="24" height="17" rx="4" fill="#1f2430" />
      <circle cx="128" cy="88.5" r="5" fill="#fff" />
      <circle cx="128" cy="88.5" r="2.6" fill="#1f2430" />
      <path className="anim-flash" d="M112 70 l3 6 l6 -1 l-4 5 l4 5 l-6 -1 l-3 6 l-2 -6 l-6 1 l4 -5 l-4 -5 l6 1Z" fill={KID.yellow} />
    </KidArt>
  );
}

/** 5. Ведёт творческое занятие: мазок кистью сам появляется на холсте. */
function Painting() {
  return (
    <KidArt label="Волонтёр ведёт занятие по живописи">
      <Birds at={[[20, 24], [40, 16]]} />
      <path d="M132 58 L120 140 M132 58 L144 140" stroke={FURNITURE_DARK} strokeWidth="4" strokeLinecap="round" />
      <rect x="104" y="34" width="56" height="64" rx="4" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <circle cx="118" cy="50" r="6" fill={KID.yellow} />
      <path className="anim-draw" pathLength={100} d="M112 84 C122 60 134 92 152 56" stroke={KID.blue} strokeWidth="5" fill="none" strokeLinecap="round" />
      <Person x={64} y={66} skin={SKIN.light} shirt={KID.red} hair={HAIR.dark} style="short" />
      <g className="anim-bob">
        <Arm from={[82, 90]} to={[102, 76]} skin={SKIN.light} />
        <path d="M102 76 l9 -7" stroke="#1f2430" strokeWidth="3" strokeLinecap="round" />
      </g>
    </KidArt>
  );
}

/** 6. Валяние: клубок крутится, спицы двигаются. */
function Felting() {
  return (
    <KidArt label="Волонтёрка учит ребёнка валять из шерсти">
      <Sun x={30} y={28} />
      <Birds at={[[140, 22], [160, 30]]} />
      <Person x={66} y={66} skin={SKIN.mid} shirt={KID.pink} hair={HAIR.brown} style="long" />
      <Person x={146} y={80} s={0.8} skin={SKIN.light} shirt={KID.yellow} hair={HAIR.dark} style="short" />
      <rect x="30" y="116" width="140" height="9" rx="4" fill={FURNITURE_DARK} />
      <path d="M104 106 C120 112 128 104 136 100" stroke={KID.teal} strokeWidth="2" fill="none" />
      <g className="anim-yarn">
        <circle cx="102" cy="104" r="12" fill={KID.teal} />
        <path d="M92 100 C98 96 106 98 112 104 M94 110 C100 104 108 106 112 110 M98 94 C104 100 104 108 100 116" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.8" />
      </g>
      <g className="anim-needles">
        <path d="M80 98 L100 84 M84 84 L100 98" stroke="#1f2430" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <Arm from={[80, 92]} to={[88, 96]} skin={SKIN.mid} />
    </KidArt>
  );
}

/** 7. Кулинарный мастер-класс: венчик мешает, над миской пар. */
function Cooking() {
  return (
    <KidArt label="Волонтёр готовит с ребёнком на кулинарном мастер-классе">
      <Birds at={[[132, 22], [152, 14]]} />
      <Person x={60} y={66} skin={SKIN.dark} shirt={KID.green} hair="#ffffff" style="beanie" />
      <Person x={150} y={80} s={0.8} skin={SKIN.mid} shirt={KID.yellow} hair={HAIR.brown} style="long" />
      <rect x="28" y="118" width="144" height="9" rx="4" fill={FURNITURE_DARK} />
      {[92, 102, 112].map((x, i) => (
        <path key={x} className={`anim-steam anim-steam-${i + 1}`} d={`M${x} 92 c-4 -6 4 -10 0 -16`} stroke={FURNITURE_DARK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ))}
      <path d="M80 104 h44 a22 15 0 0 1 -44 0Z" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <g className="anim-stir">
        <path d="M100 106 L112 80" stroke="#1f2430" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="99" cy="108" rx="5" ry="3" fill="none" stroke="#1f2430" strokeWidth="1.5" />
      </g>
      <Arm from={[78, 92]} to={[110, 84]} skin={SKIN.dark} />
    </KidArt>
  );
}

/** 8. Выезды и прогулки: идут рядом, светит солнце. */
function Walk() {
  return (
    <KidArt label="Волонтёр гуляет с подростком">
      <Sun x={34} y={30} />
      <Birds at={[[90, 24], [110, 16]]} />
      <rect x="160" y="96" width="8" height="40" rx="3" fill={CLAY} />
      <circle cx="164" cy="84" r="22" fill={KID.green} />
      {([[156, 76], [170, 80], [162, 94], [174, 92]] as Point[]).map(([cx, cy]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="2.6" fill={KID.red} />
      ))}
      <path d="M20 138 H180" stroke={FURNITURE} strokeWidth="4" strokeLinecap="round" />
      <g className="anim-bob">
        <Person x={70} y={62} skin={SKIN.light} shirt={KID.blue} hair={HAIR.grey} style="short" glasses legs />
      </g>
      <g className="anim-bob-late">
        <Person x={118} y={76} s={0.85} skin={SKIN.dark} shirt={KID.orange} hair={HAIR.dark} style="curly" legs />
      </g>
    </KidArt>
  );
}

/** 9. Онлайн-помощь: тексты, дизайн, переводы — строки сами набираются на экране. */
function Online() {
  return (
    <KidArt label="Волонтёрка помогает фонду онлайн за ноутбуком">
      <Sun x={164} y={30} />
      <Person x={58} y={70} skin={SKIN.mid} shirt={KID.teal} hair={HAIR.brown} style="long" glasses />
      <rect x="24" y="118" width="152" height="9" rx="4" fill={FURNITURE_DARK} />
      <rect x="86" y="70" width="60" height="40" rx="5" fill="#1f2430" />
      <rect x="90" y="74" width="52" height="32" rx="3" fill="#fff" />
      {[80, 88, 96].map((y, i) => (
        <rect key={y} className={`anim-fill anim-fill-${i + 1}`} x="95" y={y} width={i === 2 ? 26 : 40} height="4" rx="2" fill={i === 1 ? KID.teal : KID.green} />
      ))}
      <path d="M80 110 h72 l-6 8 h-60Z" fill="#3a4152" />
      <rect x="156" y="104" width="12" height="14" rx="3" fill={KID.red} />
      <path className="anim-steam anim-steam-2" d="M162 100 c-3 -5 3 -8 0 -13" stroke={FURNITURE_DARK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </KidArt>
  );
}

/** 10. Водитель: везёт работы мастерских на ярмарку — колёса крутятся, дорога бежит. */
function Driver() {
  return (
    <KidArt label="Волонтёр-водитель везёт работы мастерских на ярмарку">
      <Sun x={30} y={30} />
      <Birds at={[[150, 26], [170, 18]]} />
      <g className="anim-road">
        {[0, 40, 80, 120, 160, 200].map((x) => (
          <rect key={x} x={x} y="140" width="22" height="4" rx="2" fill={FURNITURE} />
        ))}
      </g>
      <g className="anim-bob">
        <rect x="60" y="58" width="22" height="16" rx="3" fill={CLAY} />
        <rect x="84" y="62" width="18" height="12" rx="3" fill={KID.yellow} />
        <path d="M44 120 V100 q0 -10 10 -10 h24 l14 -14 h34 q8 0 12 8 l8 16 q8 2 8 10 v10Z" fill={KID.blue} />
        <path d="M96 80 h28 q4 0 6 4 l6 12 h-40Z" fill="#fff" />
        <circle cx="114" cy="90" r="6" fill={SKIN.mid} />
        <path d="M108 88 a6 6 0 0 1 12 0Z" fill={HAIR.dark} />
      </g>
      {[68, 132].map((cx) => (
        <g key={cx} className="anim-wheel">
          <circle cx={cx} cy="122" r="12" fill="#1f2430" />
          <circle cx={cx} cy="122" r="5" fill="#fff" />
          <path d={`M${cx} 113 v18 M${cx - 9} 122 h18`} stroke="#fff" strokeWidth="1.5" />
        </g>
      ))}
    </KidArt>
  );
}

/** 11. Медиатор на выставке: рассказывает ребёнку о картине, тот кивает. */
function Exhibition() {
  return (
    <KidArt label="Волонтёр-медиатор рассказывает ребёнку о картине на выставке">
      <Birds at={[[20, 22], [40, 30]]} />
      <rect x="98" y="24" width="68" height="52" rx="3" fill="#fff" stroke={FURNITURE_DARK} strokeWidth="5" />
      <circle cx="148" cy="40" r="6" fill={KID.yellow} />
      <path d="M102 72 l18 -18 l14 12 l10 -8 l20 14Z" fill={KID.green} />
      <Person x={64} y={70} skin={SKIN.light} shirt={KID.pink} hair={HAIR.brown} style="bun" />
      <Arm from={[80, 92]} to={[98, 66]} skin={SKIN.light} className="anim-bob" />
      <Person x={150} y={92} s={0.75} skin={SKIN.dark} shirt={KID.teal} hair={HAIR.dark} style="curly" headClass="anim-nod" />
    </KidArt>
  );
}

/** 12. Обучение: буквы сами появляются на доске. */
function Teaching() {
  return (
    <KidArt label="Волонтёр занимается с ребёнком у доски">
      <Birds at={[[20, 24], [40, 16]]} />
      <rect x="92" y="26" width="84" height="56" rx="6" fill={KID.green} />
      <path className="anim-draw" pathLength={100} d="M104 66 l8 -26 l8 26 M108 56 h8 M128 40 v26 h10 q8 0 8 -7 q0 -7 -8 -7 h-10 M152 40 v26" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Person x={62} y={70} skin={SKIN.mid} shirt={KID.yellow} hair={HAIR.grey} style="short" glasses />
      <Arm from={[78, 92]} to={[96, 70]} skin={SKIN.mid} className="anim-bob" />
      <Person x={146} y={96} s={0.7} skin={SKIN.light} shirt={KID.orange} hair={HAIR.brown} style="long" />
    </KidArt>
  );
}

/** 12 направлений: в кадре одновременно видно разные, без повторов. */
export const SCENES = [
  { title: "Помощь на мастер-классах", sub: "Керамика, живопись, валяние, кулинария", art: <Masterclass /> },
  { title: "Наставничество", sub: "Стать значимым взрослым для ребят", art: <Mentor /> },
  { title: "Помощь специалистов", sub: "Психолог, логопед, юрист", art: <Specialist /> },
  { title: "Ярмарки и фото", sub: "Маркеты фонда, съёмка, соцсети", art: <FairAndPhoto /> },
  { title: "Ведение занятий", sub: "Живопись, рисунок, своя программа", art: <Painting /> },
  { title: "Валяние и рукоделие", sub: "Шерсть, шитьё, вязание", art: <Felting /> },
  { title: "Кулинарные мастер-классы", sub: "Готовим вместе с ребятами", art: <Cooking /> },
  { title: "Выезды и прогулки", sub: "Арт-резиденция, поездки", art: <Walk /> },
  { title: "Онлайн-помощь", sub: "Тексты, дизайн, переводы", art: <Online /> },
  { title: "Водитель", sub: "Отвезти работы на ярмарку", art: <Driver /> },
  { title: "Медиатор на выставке", sub: "Рассказать о работах ребят", art: <Exhibition /> },
  { title: "Обучение", sub: "Занятия и передача знаний", art: <Teaching /> },
];

function SceneCard({ s }: { s: (typeof SCENES)[number] }) {
  return (
    <div className="flex flex-col gap-2 rounded-[1.75rem] bg-white p-3 pb-4 shadow-[0_20px_34px_-22px_var(--p-ink)]">
      {s.art}
      <div className="px-1">
        <p className="leading-snug font-semibold">{s.title}</p>
        <p className="text-sm leading-snug text-hint">{s.sub}</p>
      </div>
    </div>
  );
}

/** 3D-бегущая лента (как 3d-marquee у Aceternity, без библиотеки): 3 колонки по 4 своих сцены
 *  на наклонённой плоскости, соседние колонки едут в разные стороны. Каждая колонка повторена трижды и едет
 *  со средней копии: сверху и снизу всегда есть карточки, пустых краёв в кадре нет.
 *  fill — лента на всю высоту родителя (страница входа), иначе своя высота, как на лендинге. */
export default function VolunteerScenes(props: { fill?: boolean }) {
  const columns = [0, 1, 2].map((c) => SCENES.filter((_, i) => i % 3 === c));
  return (
    <>
      <ul className="sr-only" aria-label="Чем помогают волонтёры">
        {SCENES.map((s) => (
          <li key={s.title}>
            {s.title}: {s.sub}
          </li>
        ))}
      </ul>
      <div className={`marquee3d tile-in relative overflow-x-clip ${props.fill ? "h-full" : "h-[26rem] md:h-[34rem]"}`} aria-hidden="true">
        <div className="marquee3d-fade absolute inset-0 overflow-hidden bg-surface">
          <div className="marquee3d-plane grid grid-cols-3 gap-4">
            {columns.map((col, c) => (
              <div key={c} className={`marquee3d-col flex flex-col gap-4 ${c % 2 ? "marquee3d-down" : "marquee3d-up"}`} style={{ animationDuration: `${[44, 52, 48][c]}s` }}>
                {[...col, ...col, ...col].map((s, i) => (
                  <SceneCard key={`${s.title}-${i}`} s={s} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
