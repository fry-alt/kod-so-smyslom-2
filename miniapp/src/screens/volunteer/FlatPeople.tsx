// Общие детали плоских иллюстраций: персонажи сцен «чем помогают волонтёры» (VolunteerScenes.tsx)
// и блока «Как всё устроено» (JourneyArt.tsx). Стиль один: мягкие формы без обводки, тени — тот же цвет,
// смешанный с --p-ink, блики — с белым. Персонаж рисуется в своих координатах (центр лица ≈ 97, 66,
// низ кадра — 192), в сцену его ставит pose(): центр лица в координатах сцены и масштаб.
import type { CSSProperties } from "react";

export const SKIN = { light: "#f6c9a4", mid: "#ecb48e" };
export const HAIR = { grey: "#c9ccd3", brown: "#7a4a2e", dark: "#2b2140" };
export const CLAY = "#d9773f";

/** Тень того же тона: цвет, смешанный с --p-ink. */
export const shade = (c: string, p: number) => `color-mix(in srgb, ${c} ${100 - p}%, var(--p-ink))`;
/** Светлый вариант того же тона. */
export const tint = (c: string, p: number) => `color-mix(in srgb, ${c} ${100 - p}%, #fff)`;

export type Mood = "focus" | "interest" | "joy";
export type Pt = [number, number];

/** Глаз: тёмный овал с бликом. dx/dy — куда смотрит, k — размер (у детей глаза крупнее). */
export function Eye(props: { x: number; y: number; dx?: number; dy?: number; k?: number }) {
  const x = props.x + (props.dx ?? 0);
  const y = props.y + (props.dy ?? 0);
  const k = props.k ?? 1;
  return (
    <>
      <ellipse cx={x} cy={y} rx={2.9 * k} ry={3.7 * k} fill="var(--p-ink)" />
      <circle cx={x + 1 * k} cy={y - 1.4 * k} r={1.1 * k} fill="#fff" />
    </>
  );
}

/** Рот по настроению: спокойная улыбка, улыбка шире, открытая радостная. При наведении на карточку шага — шире (jr-smile-wide). */
export function Mouth(props: { mood: Mood; x?: number; y?: number; k?: number }) {
  const x = props.x ?? 97;
  const y = props.y ?? 80;
  const lip = shade("var(--p-pop-2)", 45);
  const k = props.k ?? 1;
  return (
    <g transform={k === 1 ? undefined : `translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})`}>
      {props.mood === "joy" ? (
        <g className="jr-smile">
          <path d={`M${x - 6.5} ${y - 0.5} q6.5 8 13 0Z`} fill={lip} />
          <path d={`M${x - 3} ${y + 4.3} q3 -2.4 6 0 q-3 2 -6 0Z`} fill={tint("var(--p-pop-2)", 35)} />
        </g>
      ) : (
        <path
          className="jr-smile"
          d={props.mood === "focus" ? `M${x - 4.5} ${y + 1} q4.5 3.4 9 0` : `M${x - 5.5} ${y + 0.5} q5.5 4.6 11 0`}
          stroke={lip}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
      <path className="jr-smile-wide" d={`M${x - 7.5} ${y - 1} q7.5 9.5 15 0Z`} fill={lip} />
    </g>
  );
}

/** Рукав: основной цвет поверх чуть более тёмной подложки — рука отделяется от тела без обводки. */
export function Sleeve(props: { d: string; color: string; w?: number }) {
  const w = props.w ?? 19;
  return (
    <>
      <path d={props.d} stroke={shade(props.color, 9)} strokeWidth={w + 3 * (w / 19)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={props.d} stroke={props.color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/** Кисть с четырьмя пальцами и большим: (x, y) — центр ладони, angle — куда смотрят пальцы, k — размер. */
export function Hand(props: { x: number; y: number; angle: number; skin: string; k?: number; flip?: boolean }) {
  const k = props.k ?? 1;
  const thumbY = props.flip ? 6.5 : -6.5;
  return (
    <g transform={`translate(${props.x} ${props.y}) rotate(${props.angle}) scale(${k})`} fill={props.skin}>
      <rect x="-1.5" y={thumbY - 1.6} width="8" height="3.4" rx="1.7" transform={`rotate(${props.flip ? 28 : -28} -1.5 ${thumbY})`} />
      <ellipse cx="0" cy="0" rx="6.8" ry="5.8" />
      {[-4.2, -1.4, 1.4, 4.2].map((fy, i) => (
        <rect key={fy} x="3" y={fy - 1.4} width={i === 0 || i === 3 ? 6.4 : 7.6} height="2.8" rx="1.4" />
      ))}
      <path d="M-2 -3.6 q-1.4 3.6 0 7.2" stroke={shade(props.skin, 16)} strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Где стоит персонаж: центр лица (x, y) в координатах сцены и масштаб k.
 *  at — transform для <g>, p() — точка из координат персонажа в координаты сцены, breathe — опора для дыхания. */
export type Pose = { at: string; k: number; p: (lx: number, ly: number) => Pt; breathe: (delay?: number) => CSSProperties };

export function pose(x: number, y: number, k: number): Pose {
  const tx = x - 97 * k;
  const ty = y - 66 * k;
  return {
    at: `translate(${r1(tx)} ${r1(ty)}) scale(${k})`,
    k,
    p: (lx, ly) => [r1(tx + lx * k), r1(ty + ly * k)],
    breathe: (delay = 0) => ({ transformOrigin: `${r1(x)}px ${r1(ty + 192 * k)}px`, animationDelay: `${-delay}s` }),
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Рука в координатах сцены: от плеча через локоть к кисти. short — короткий рукав (футболка), дальше видна кожа. */
export function Arm(props: {
  from: Pt;
  elbow: Pt;
  to: Pt;
  sleeve: string;
  skin: string;
  k: number;
  short?: boolean;
  flip?: boolean;
  angle?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { from, elbow, to, k } = props;
  const ux = to[0] - elbow[0];
  const uy = to[1] - elbow[1];
  const len = Math.hypot(ux, uy) || 1;
  const angle = props.angle ?? (Math.atan2(uy, ux) * 180) / Math.PI;
  const hand: Pt = [r1(to[0] + (ux / len) * 6 * k), r1(to[1] + (uy / len) * 6 * k)];
  const mid: Pt = [r1(from[0] + (elbow[0] - from[0]) * 0.55), r1(from[1] + (elbow[1] - from[1]) * 0.55)];
  return (
    <g className={props.className} style={props.style}>
      {props.short ? (
        <>
          <path d={`M${mid[0]} ${mid[1]} Q${elbow[0]} ${elbow[1]} ${to[0]} ${to[1]}`} stroke={shade(props.skin, 10)} strokeWidth={13 * k} fill="none" strokeLinecap="round" />
          <path d={`M${mid[0]} ${mid[1]} Q${elbow[0]} ${elbow[1]} ${to[0]} ${to[1]}`} stroke={props.skin} strokeWidth={11 * k} fill="none" strokeLinecap="round" />
          <Sleeve d={`M${from[0]} ${from[1]} L${mid[0]} ${mid[1]}`} color={props.sleeve} w={20 * k} />
        </>
      ) : (
        <Sleeve d={`M${from[0]} ${from[1]} Q${elbow[0]} ${elbow[1]} ${to[0]} ${to[1]}`} color={props.sleeve} w={19 * k} />
      )}
      <Hand x={hand[0]} y={hand[1]} angle={angle} skin={props.skin} k={1.15 * k * (props.short ? 1.1 : 1)} flip={props.flip ?? Math.abs(angle) > 90} />
    </g>
  );
}

export type HairStyle = "long" | "short" | "bun" | "curly" | "ponytail" | "beanie";
export type Top = "sweater" | "cardigan" | "tshirt" | "shirt";

const ADULT_BODY = "M38 192 C38 158 41 128 56 116 C66 108 78 104 88 103 L106 103 C116 104 128 108 138 116 C153 128 156 158 156 192Z";
const ADULT_SIDE = "M138 116 C151 127 155 156 156 192 L148 192 C148 160 146 134 138 116Z";
const KID_BODY = "M56 192 C56 160 60 124 72 112 C79 105 87 102 92 102 L102 102 C107 102 115 105 122 112 C134 124 138 160 138 192Z";
const KID_SIDE = "M122 112 C133 123 137 156 138 192 L131 192 C131 160 129 132 122 112Z";
const ADULT_FACE = "M75 62 C75 45 85 39 97 39 C109 39 119 45 119 62 C119 79 110 90 97 90 C84 90 75 79 75 62Z";
const KID_FACE = "M72 64 C72 46 83 39 97 39 C111 39 122 46 122 64 C122 82 111 93 97 93 C83 93 72 82 72 64Z";

/** Персонаж в своих координатах. Взрослый — голова примерно треть видимого роста; ребёнок (kid) — голова крупнее,
 *  плечи уже. scarf — зелёный шарф волонтёра фонда (тот же, что у героини «Как всё устроено»).
 *  Сам по себе дышит (снаружи — jr-breathe в сцене), покачивает головой и моргает с задержкой blink. */
export function FlatPerson(props: {
  skin: string;
  hair: string;
  style: HairStyle;
  top: Top;
  color: string;
  kid?: boolean;
  glasses?: boolean;
  scarf?: boolean;
  hat?: string;
  mood?: Mood;
  look?: Pt;
  blink?: number;
  headClass?: string;
}) {
  const { skin, hair, color, kid } = props;
  const mood = props.mood ?? "interest";
  const [lx, ly] = props.look ?? [0, 0];
  const ex = kid ? [87.5, 106.5] : [88.5, 105.5];
  const earX = kid ? [72, 122] : [75.5, 118.5];
  const brows =
    mood === "focus"
      ? "M83 57.5 q5 -2.6 9.5 0.6 M102 58 q4.6 -3.2 9.5 -0.8"
      : mood === "joy"
        ? "M82.5 55.6 q5 -4 9.5 -1.6 M102.5 54 q4.6 -2.4 9.5 1.6"
        : "M83 56 q5 -3.6 9.5 -1.2 M102 54.8 q4.6 -2.4 9.5 1.2";
  const hairLight = tint(hair, 32);

  return (
    <>
      {/* задний слой волос */}
      {props.style === "long" && (
        <path d="M70 66 C66 38 84 26 98 26 C117 26 133 39 128 66 L131 110 C122 117 112 116 106 110 L90 110 C82 117 71 116 65 110Z" fill={shade(hair, 22)} />
      )}
      {props.style === "curly" &&
        (kid
          ? ([[74, 52], [80, 38], [92, 31], [106, 31], [118, 39], [123, 53]] as Pt[])
          : ([[76, 54], [80, 40], [91, 32], [104, 32], [115, 40], [119, 54]] as Pt[])
        ).map(([cx, cy]) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="11" fill={shade(hair, 15)} />)}

      {/* одежда */}
      <path d={kid ? KID_BODY : ADULT_BODY} fill={color} />
      <path d={kid ? KID_SIDE : ADULT_SIDE} fill={shade(color, 9)} />
      {props.top === "sweater" && (
        <>
          <path d={kid ? "M74 150 q4 12 2 26" : "M68 150 q5 12 3 26 M122 148 q-3 12 1 26"} stroke={shade(color, 12)} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M86 104 q11 9 22 0" stroke={shade(color, 14)} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        </>
      )}
      {props.top === "cardigan" && (
        <>
          <path d="M86 103 L97 130 L108 103Z" fill="#fff" />
          <path d="M86 103 L79 113 L93 115Z M108 103 L115 113 L101 115Z" fill={tint("var(--p-soft)", 40)} />
          <path d="M97 130 V192" stroke={shade(color, 12)} strokeWidth="2" strokeLinecap="round" />
          {[142, 158, 174].map((y) => (
            <circle key={y} cx="101" cy={y} r="2.6" fill={tint(color, 60)} />
          ))}
          <rect x="112" y="156" width="20" height="15" rx="4" fill={shade(color, 6)} />
          <path d="M112 160 h20" stroke={shade(color, 14)} strokeWidth="1.6" />
        </>
      )}
      {props.top === "tshirt" && (
        <>
          <path d="M88 103 q9 8 18 0" stroke={shade(color, 14)} strokeWidth="3" fill="none" strokeLinecap="round" />
          {kid ? (
            <path d="M97 128 l3.2 6.6 l7.2 1 l-5.2 5 l1.3 7.2 l-6.5 -3.4 l-6.5 3.4 l1.3 -7.2 l-5.2 -5 l7.2 -1Z" fill={tint(color, 70)} />
          ) : (
            <path d="M44 150 H150 M42 164 H152" stroke={tint(color, 45)} strokeWidth="5" />
          )}
        </>
      )}
      {props.top === "shirt" && (
        <>
          <path d="M88 103 L97 114 L106 103 L112 111 L100 120 L97 116 L94 120 L82 111Z" fill={tint(color, 55)} />
          <path d="M97 118 V192" stroke={shade(color, 12)} strokeWidth="2" strokeLinecap="round" />
          {[134, 152, 170].map((y) => (
            <circle key={y} cx="101.5" cy={y} r="2.2" fill={tint(color, 55)} />
          ))}
          <path d="M60 136 h18 v12 h-18Z" fill={shade(color, 6)} />
        </>
      )}

      {/* шея с тенью под подбородком */}
      {kid ? (
        <>
          <path d="M90 88 L90 104 Q97 108 104 104 L104 88Z" fill={skin} />
          <path d="M90 89 Q97 99 104 89 L104 95 Q97 102 90 95Z" fill={shade(skin, 14)} />
        </>
      ) : (
        <>
          <path d="M88 86 L88 106 Q97 112 106 106 L106 86Z" fill={skin} />
          <path d="M88 87 Q97 99 106 87 L106 95 Q97 104 88 95Z" fill={shade(skin, 14)} />
        </>
      )}

      {props.scarf && !kid && (
        <>
          <path d="M81 100 C89 113 106 113 114 100 L119 108 C109 123 87 123 77 108Z" fill="var(--p-accent)" />
          <path d="M85 110 C93 117 104 117 112 109" stroke={shade("var(--p-accent)", 22)} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M100 113 C104 125 106 137 104 150 L115 150 C117 137 115 122 109 111Z" fill="var(--p-accent)" />
          <path d="M103.5 128 h11 M104 138 h11.5" stroke={tint("var(--p-accent)", 38)} strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}

      <g className={props.headClass ?? "jr-head"} style={{ animationDelay: `${-(props.blink ?? 0) * 1.7}s` }}>
        {props.style === "ponytail" && (
          <path d="M114 44 C134 44 142 66 134 96 C129 84 124 66 112 54Z" fill={shade(hair, 15)} />
        )}
        {props.style === "bun" && (
          <>
            <circle cx="97" cy="31" r="12" fill={shade(hair, 12)} />
            <path d="M89 29 q8 -8 16 0" stroke={tint(hair, 40)} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* уши с тенью */}
        {earX.map((x, i) => (
          <g key={x}>
            <circle cx={x} cy="69" r={kid ? 5.6 : 5.2} fill={skin} />
            <path d={i === 0 ? `M${x - 1.5} 66.5 q-2 2.6 0.4 5` : `M${x + 1.5} 66.5 q2 2.6 -0.4 5`} stroke={shade(skin, 18)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        ))}
        <path d={kid ? KID_FACE : ADULT_FACE} fill={skin} />

        {/* передний слой волос */}
        {props.style === "long" && (
          <>
            <path d="M73 66 C69 41 85 29 100 30 C117 31 128 44 121 67 C119 55 113 47 105 44.5 C97 53 86 60 73 66Z" fill={hair} />
            <path d="M73.5 60 C70 74 71.5 88 76 97 C80 88 80.5 74 78.5 61Z M120.5 60 C124 74 122.5 88 118 97 C114 88 113.5 74 115.5 61Z" fill={hair} />
          </>
        )}
        {(props.style === "short" || props.style === "ponytail") && (
          <>
            <path d="M73 64 C70 40 85 30 98 30 C114 30 126 42 121 64 C119 53 112 46 103 45 C94 49 83 53 73 64Z" fill={hair} />
            <path d="M73.5 58 C72 65 72.5 71 74.5 75 C76.5 69 77 64 76.5 58Z M120.5 58 C122 65 121.5 71 119.5 75 C117.5 69 117 64 117.5 58Z" fill={hair} />
          </>
        )}
        {props.style === "ponytail" && <rect x="112" y="45" width="7" height="6" rx="2.5" fill="var(--p-pop-2)" transform="rotate(30 115 48)" />}
        {props.style === "bun" && (
          <path d="M73.5 66 C70 44 83 34 97 34 C111 34 124 44 120.5 66 C118 56 112 49 104 47 C99 50 94 50 89 47 C82 49 76 56 73.5 66Z" fill={hair} />
        )}
        {props.style === "curly" &&
          (kid
            ? ([[77, 50, 8], [86, 42, 9], [97, 39, 9], [108, 42, 9], [117, 50, 8]] as [number, number, number][])
            : ([[79, 50, 7.5], [87, 42, 8.5], [97, 39, 8.5], [107, 42, 8.5], [115, 50, 7.5]] as [number, number, number][])
          ).map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} fill={hair} />)}
        {props.style === "beanie" && (
          <>
            <path d="M74 60 C73 66 73.5 72 75.5 76 C77.5 70 78 65 77.5 60Z M120 60 C121 66 120.5 72 118.5 76 C116.5 70 116 65 116.5 60Z" fill={hair} />
            <circle cx="97" cy="24" r="6.5" fill={tint(props.hat ?? color, 40)} />
            <path d="M72 58 C70 34 84 27 97 27 C110 27 124 34 122 58Z" fill={props.hat ?? color} />
            <path d="M86 32 v22 M97 29 v25 M108 32 v22" stroke={shade(props.hat ?? color, 8)} strokeWidth="2" strokeLinecap="round" />
            <rect x="70" y="51" width="54" height="10" rx="5" fill={shade(props.hat ?? color, 10)} />
          </>
        )}
        {props.style !== "beanie" && props.style !== "curly" && (
          <path d="M88 36.5 C96 33 106 33.5 113 39" stroke={hairLight} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        )}
        {props.style === "curly" && <path d="M90 37 q4 -3 8 -1 M104 38 q4 -1 6 2" stroke={hairLight} strokeWidth="2" fill="none" strokeLinecap="round" />}

        {/* брови, глаза (моргают), румянец, нос, рот */}
        <path d={brows} stroke={shade(hair === HAIR.grey ? "#8a8d96" : hair, 15)} strokeWidth="2.1" fill="none" strokeLinecap="round" />
        <g className="jr-blink" style={{ transformOrigin: "97px 68px", ["--d" as string]: `${props.blink ?? 1.2}s` }}>
          <Eye x={ex[0]} y={68} dx={lx} dy={ly} k={kid ? 1.2 : 1} />
          <Eye x={ex[1]} y={68} dx={lx} dy={ly} k={kid ? 1.2 : 1} />
        </g>
        <ellipse cx={kid ? 81 : 83.5} cy="78.5" rx="4.4" ry="2.6" fill="var(--p-pop-2)" opacity={kid ? 0.3 : 0.2} />
        <ellipse cx={kid ? 113 : 111} cy="78.5" rx="4.4" ry="2.6" fill="var(--p-pop-2)" opacity={kid ? 0.3 : 0.2} />
        <path d="M98 71.5 q2.2 3.2 -0.8 4.4" stroke={shade(skin, 22)} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <Mouth mood={mood} y={81} k={kid ? 1.25 : 1} />
        {props.glasses && (
          <g stroke={shade(skin, 55)} strokeWidth="1.8" fill="#fff" fillOpacity="0.25">
            <circle cx={ex[0]} cy="68.5" r="6.4" />
            <circle cx={ex[1]} cy="68.5" r="6.4" />
            <path d={`M${ex[0] + 6.4} 68 H${ex[1] - 6.4}`} fill="none" />
          </g>
        )}
      </g>
    </>
  );
}
