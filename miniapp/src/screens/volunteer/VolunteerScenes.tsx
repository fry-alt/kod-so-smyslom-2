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
      <Person x={144} y={76} s={0.85} skin={SKIN.dark} shirt="var(--logo-cyan)" hair={HAIR.dark} style="curly" />
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
      <Person x={160} y={66} skin={SKIN.dark} shirt="var(--logo-blue)" hair="var(--logo-berry)" style="beanie" />
      <Arm from={[146, 92]} to={[136, 90]} skin={SKIN.dark} />
      <rect x="118" y="80" width="24" height="17" rx="4" fill="#1f2430" />
      <circle cx="128" cy="88.5" r="5" fill="#fff" />
      <circle cx="128" cy="88.5" r="2.6" fill="#1f2430" />
      <path className="anim-flash" d="M112 70 l3 6 l6 -1 l-4 5 l4 5 l-6 -1 l-3 6 l-2 -6 l-6 1 l4 -5 l-4 -5 l6 1Z" fill="var(--p-pop)" />
    </Scene>
  );
}

/** 5. Ведёт творческое занятие: мазок кистью сам появляется на холсте. */
function Painting() {
  return (
    <Scene label="Волонтёр ведёт занятие по живописи">
      <path d="M132 58 L120 140 M132 58 L144 140" stroke={FURNITURE_DARK} strokeWidth="4" strokeLinecap="round" />
      <rect x="104" y="34" width="56" height="64" rx="4" fill="#fff" stroke="var(--p-soft)" strokeWidth="2" />
      <circle cx="118" cy="50" r="6" fill="var(--p-pop)" />
      <path className="anim-draw" pathLength={100} d="M112 84 C122 60 134 92 152 56" stroke="var(--logo-blue)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <Person x={64} y={66} skin={SKIN.light} shirt="var(--logo-orange)" hair={HAIR.dark} style="short" />
      <g className="anim-bob">
        <Arm from={[82, 90]} to={[102, 76]} skin={SKIN.light} />
        <path d="M102 76 l9 -7" stroke="#1f2430" strokeWidth="3" strokeLinecap="round" />
      </g>
    </Scene>
  );
}

/** 6. Валяние: клубок крутится, спицы двигаются. */
function Felting() {
  return (
    <Scene label="Волонтёрка учит ребёнка валять из шерсти">
      <Person x={66} y={66} skin={SKIN.mid} shirt="var(--logo-berry)" hair={HAIR.brown} style="long" />
      <Person x={146} y={80} s={0.8} skin={SKIN.light} shirt="var(--p-pop)" hair={HAIR.dark} style="short" />
      <rect x="30" y="116" width="140" height="9" rx="4" fill={FURNITURE_DARK} />
      <path d="M104 106 C120 112 128 104 136 100" stroke="var(--logo-cyan)" strokeWidth="2" fill="none" />
      <g className="anim-yarn">
        <circle cx="102" cy="104" r="12" fill="var(--logo-cyan)" />
        <path d="M92 100 C98 96 106 98 112 104 M94 110 C100 104 108 106 112 110 M98 94 C104 100 104 108 100 116" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.8" />
      </g>
      <g className="anim-needles">
        <path d="M80 98 L100 84 M84 84 L100 98" stroke="#1f2430" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <Arm from={[80, 92]} to={[88, 96]} skin={SKIN.mid} />
    </Scene>
  );
}

/** 7. Кулинарный мастер-класс: венчик мешает, над миской пар. */
function Cooking() {
  return (
    <Scene label="Волонтёр готовит с ребёнком на кулинарном мастер-классе">
      <Person x={60} y={66} skin={SKIN.dark} shirt="var(--p-accent)" hair="#ffffff" style="beanie" />
      <Person x={150} y={80} s={0.8} skin={SKIN.mid} shirt="var(--logo-yellow)" hair={HAIR.brown} style="long" />
      <rect x="28" y="118" width="144" height="9" rx="4" fill={FURNITURE_DARK} />
      {[92, 102, 112].map((x, i) => (
        <path key={x} className={`anim-steam anim-steam-${i + 1}`} d={`M${x} 92 c-4 -6 4 -10 0 -16`} stroke={FURNITURE_DARK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ))}
      <path d="M80 104 h44 a22 15 0 0 1 -44 0Z" fill="#fff" stroke="var(--p-soft)" strokeWidth="2" />
      <g className="anim-stir">
        <path d="M100 106 L112 80" stroke="#1f2430" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="99" cy="108" rx="5" ry="3" fill="none" stroke="#1f2430" strokeWidth="2" />
      </g>
      <Arm from={[78, 92]} to={[110, 84]} skin={SKIN.dark} />
    </Scene>
  );
}

/** 8. Выезды и прогулки: идут рядом, светит солнце. */
function Walk() {
  return (
    <Scene label="Волонтёр гуляет с подростком">
      <circle className="anim-pulse" cx="34" cy="30" r="12" fill="var(--p-pop)" />
      <rect x="160" y="96" width="8" height="40" rx="3" fill={CLAY} />
      <circle cx="164" cy="84" r="22" fill="var(--logo-green)" />
      <path d="M20 138 H180" stroke={FURNITURE} strokeWidth="4" strokeLinecap="round" />
      <g className="anim-bob">
        <Person x={70} y={66} skin={SKIN.light} shirt="var(--logo-blue)" hair={HAIR.grey} style="short" glasses />
      </g>
      <g className="anim-bob-late">
        <Person x={118} y={78} s={0.85} skin={SKIN.dark} shirt="var(--p-pop-2)" hair={HAIR.dark} style="curly" />
      </g>
    </Scene>
  );
}

/** 9. Онлайн-помощь: тексты, дизайн, переводы — строки сами набираются на экране. */
function Online() {
  return (
    <Scene label="Волонтёрка помогает фонду онлайн за ноутбуком">
      <Person x={58} y={70} skin={SKIN.mid} shirt="var(--logo-cyan)" hair={HAIR.brown} style="long" glasses />
      <rect x="24" y="118" width="152" height="9" rx="4" fill={FURNITURE_DARK} />
      <rect x="86" y="70" width="60" height="40" rx="5" fill="#1f2430" />
      <rect x="90" y="74" width="52" height="32" rx="3" fill="#fff" />
      {[80, 88, 96].map((y, i) => (
        <rect key={y} className={`anim-fill anim-fill-${i + 1}`} x="95" y={y} width={i === 2 ? 26 : 40} height="4" rx="2" fill={i === 1 ? "var(--logo-cyan)" : "var(--p-accent)"} />
      ))}
      <path d="M80 110 h72 l-6 8 h-60Z" fill="#3a4152" />
      <rect x="156" y="104" width="12" height="14" rx="3" fill="var(--logo-red)" />
      <path className="anim-steam anim-steam-2" d="M162 100 c-3 -5 3 -8 0 -13" stroke={FURNITURE_DARK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </Scene>
  );
}

/** 10. Водитель: везёт работы мастерских на ярмарку — колёса крутятся, дорога бежит. */
function Driver() {
  return (
    <Scene label="Волонтёр-водитель везёт работы мастерских на ярмарку">
      <g className="anim-road">
        {[0, 40, 80, 120, 160, 200].map((x) => (
          <rect key={x} x={x} y="140" width="22" height="4" rx="2" fill={FURNITURE} />
        ))}
      </g>
      <g className="anim-bob">
        <rect x="60" y="58" width="22" height="16" rx="3" fill={CLAY} />
        <rect x="84" y="62" width="18" height="12" rx="3" fill="var(--p-pop)" />
        <path d="M44 120 V100 q0 -10 10 -10 h24 l14 -14 h34 q8 0 12 8 l8 16 q8 2 8 10 v10Z" fill="var(--logo-blue)" />
        <path d="M96 80 h28 q4 0 6 4 l6 12 h-40Z" fill="#fff" />
        <circle cx="114" cy="90" r="6" fill={SKIN.mid} />
        <path d="M108 88 a6 6 0 0 1 12 0Z" fill={HAIR.dark} />
      </g>
      {[68, 132].map((cx) => (
        <g key={cx} className="anim-wheel">
          <circle cx={cx} cy="122" r="12" fill="#1f2430" />
          <circle cx={cx} cy="122" r="5" fill="#fff" />
          <path d={`M${cx} 113 v18 M${cx - 9} 122 h18`} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
    </Scene>
  );
}

/** 11. Медиатор на выставке: рассказывает ребёнку о картине, тот кивает. */
function Exhibition() {
  return (
    <Scene label="Волонтёр-медиатор рассказывает ребёнку о картине на выставке">
      <rect x="98" y="24" width="68" height="52" rx="3" fill="#fff" stroke={FURNITURE_DARK} strokeWidth="5" />
      <circle cx="148" cy="40" r="6" fill="var(--p-pop)" />
      <path d="M102 72 l18 -18 l14 12 l10 -8 l20 14Z" fill="var(--logo-green)" />
      <Person x={64} y={70} skin={SKIN.light} shirt="var(--logo-berry)" hair={HAIR.brown} style="bun" />
      <Arm from={[80, 92]} to={[98, 66]} skin={SKIN.light} className="anim-bob" />
      <Person x={150} y={92} s={0.75} skin={SKIN.dark} shirt="var(--logo-cyan)" hair={HAIR.dark} style="curly" headClass="anim-nod" />
    </Scene>
  );
}

/** 12. Обучение: буквы сами появляются на доске. */
function Teaching() {
  return (
    <Scene label="Волонтёр занимается с ребёнком у доски">
      <rect x="92" y="26" width="84" height="56" rx="6" fill="var(--p-accent)" />
      <path className="anim-draw" pathLength={100} d="M104 66 l8 -26 l8 26 M108 56 h8 M128 40 v26 h10 q8 0 8 -7 q0 -7 -8 -7 h-10 M152 40 v26" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Person x={62} y={70} skin={SKIN.mid} shirt="var(--logo-yellow)" hair={HAIR.grey} style="short" glasses />
      <Arm from={[78, 92]} to={[96, 70]} skin={SKIN.mid} className="anim-bob" />
      <Person x={146} y={96} s={0.7} skin={SKIN.light} shirt="var(--p-pop-2)" hair={HAIR.brown} style="long" />
    </Scene>
  );
}

/** 12 направлений: в кадре одновременно видно разные, без повторов. */
const SCENES = [
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
 *  со средней копии: сверху и снизу всегда есть карточки, пустых краёв в кадре нет. */
export default function VolunteerScenes() {
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
      <div className="marquee3d tile-in relative h-[26rem] overflow-hidden rounded-[2rem] bg-surface md:h-[34rem]" aria-hidden="true">
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
    </>
  );
}
