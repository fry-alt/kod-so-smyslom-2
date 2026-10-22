// Двенадцать сцен «что делают волонтёры фонда» — по тому, как фонд сам описывает помощь.
// Тот же плоский мягкий стиль, что у блока «Как всё устроено»: персонажи из FlatPeople.tsx, у волонтёров —
// зелёный шарф фонда. Люди дышат, моргают и покачивают головой; предметы двигаются по смыслу сцены
// (классы jr-* и anim-* в index.css). При «уменьшении движения» в системе анимации выключаются.
import type { ReactNode } from "react";

import { Arm, CLAY, FlatPerson, HAIR, SKIN, shade, tint, type Pose, pose } from "./FlatPeople";

/** Цвета одежды и предметов — смешанные из цветов палитры и логотипа, без новых. */
const C = {
  peach: tint("var(--logo-orange)", 50),
  berry: tint("var(--logo-berry)", 55),
  blue: tint("var(--logo-blue)", 55),
  cyan: tint("var(--logo-cyan)", 50),
  mustard: tint("var(--p-pop)", 40),
  yellow: "var(--p-pop)",
  table: tint("var(--p-pop)", 70),
  tableEdge: tint("var(--p-pop)", 45),
  wood: tint("var(--logo-orange)", 55),
  woodDark: shade(tint("var(--logo-orange)", 35), 20),
  steam: tint("var(--p-ink)", 70),
};

/** Рамка сцены: мягкая подложка и светлый круг за героями, как в «Как всё устроено». */
function Scene(props: { label: string; circle?: [number, number]; children: ReactNode }) {
  const [cx, cy] = props.circle ?? [120, 112];
  return (
    <svg viewBox="0 0 240 192" className="h-auto w-full rounded-[1.25rem] bg-surface" role="img" aria-label={props.label}>
      <circle cx={cx} cy={cy} r="76" fill="var(--p-soft)" />
      {props.children}
    </svg>
  );
}

/** Персонаж в сцене: дышит (jr-breathe) вокруг низа кадра; руки и предметы в его руках — children. */
function Figure(props: { p: Pose; delay?: number; wrap?: string; person: Parameters<typeof FlatPerson>[0]; children?: ReactNode }) {
  return (
    <g className={props.wrap}>
      <g className="jr-breathe" style={props.p.breathe(props.delay)}>
        <g transform={props.p.at}>
          <FlatPerson blink={props.delay} {...props.person} />
        </g>
        {props.children}
      </g>
    </g>
  );
}

/** Руки, которые нарисованы поверх предметов, дышат вместе с хозяином. */
function Breathe(props: { p: Pose; delay?: number; className?: string; children: ReactNode }) {
  return (
    <g className={props.className}>
      <g className="jr-breathe" style={props.p.breathe(props.delay)}>
        {props.children}
      </g>
    </g>
  );
}

function Table(props: { y: number }) {
  return (
    <>
      <rect x="-4" y={props.y} width="248" height={196 - props.y} rx="8" fill={C.table} />
      <path d={`M0 ${props.y + 2} H240`} stroke={tint(C.table, 45)} strokeWidth="2.4" />
    </>
  );
}

/** Гончарный круг с горшком: блик бежит по глине — круг крутится. */
function PotteryWheel(props: { id: string }) {
  const pot = "M104 168 C99 150 105 137 114 132 L130 132 C139 137 145 150 140 168Z";
  return (
    <>
      <ellipse cx="122" cy="178" rx="40" ry="10" fill={shade("var(--p-soft)", 18)} />
      <ellipse cx="122" cy="170" rx="36" ry="8" fill={tint("var(--p-ink)", 75)} />
      <ellipse cx="122" cy="168" rx="36" ry="7" fill={tint("var(--p-ink)", 85)} />
      <clipPath id={props.id}>
        <path d={pot} />
      </clipPath>
      <path d={pot} fill={CLAY} />
      <path d="M131 134 C140 140 144 152 140 168 L134 168 C137 154 136 142 131 134Z" fill={shade(CLAY, 12)} />
      <ellipse cx="122" cy="132" rx="8.5" ry="2.6" fill={shade(CLAY, 22)} />
      <g clipPath={`url(#${props.id})`}>
        <rect className="jr-spin" x="112" y="128" width="5" height="44" fill="#fff" opacity="0.3" />
      </g>
    </>
  );
}

function Bubble(props: { x: number; y: number; w: number; tail: "left" | "right"; children: ReactNode; className?: string }) {
  const { x, y, w } = props;
  const tx = props.tail === "left" ? x + 14 : x + w - 22;
  return (
    <g className={props.className}>
      <rect x={x} y={y} width={w} height="30" rx="14" fill="#fff" />
      <path d={props.tail === "left" ? `M${tx} ${y + 29} l-2 10 l10 -10Z` : `M${tx} ${y + 29} l10 10 l-1 -10Z`} fill="#fff" />
      {props.children}
    </g>
  );
}

/** 1. Помощь на мастер-классе: волонтёрка помогает ребёнку за гончарным кругом. */
function Masterclass() {
  const v = pose(68, 80, 0.74);
  const k = pose(178, 100, 0.6);
  return (
    <Scene label="Волонтёрка помогает ребёнку на гончарном круге">
      <Figure p={v} delay={0.4} person={{ skin: SKIN.light, hair: HAIR.grey, style: "bun", top: "cardigan", color: C.berry, glasses: true, scarf: true, mood: "joy", look: [1.4, 1.6] }} />
      <Figure p={k} delay={1.6} person={{ skin: SKIN.light, hair: HAIR.brown, style: "short", top: "tshirt", color: C.yellow, kid: true, mood: "joy", look: [-1.4, 1.6] }} />
      <PotteryWheel id="vs-pot" />
      <Breathe p={v} delay={0.4} className="jr-mold">
        <Arm from={v.p(136, 122)} elbow={[94, 152]} to={[102, 150]} sleeve={C.berry} skin={SKIN.light} k={v.k} />
      </Breathe>
      <Breathe p={k} delay={1.6} className="jr-mold jr-mold-late">
        <Arm from={k.p(72, 114)} elbow={[152, 146]} to={[143, 150]} sleeve={C.yellow} skin={SKIN.light} k={k.k} short />
      </Breathe>
    </Scene>
  );
}

/** 2. Значимый взрослый: разговор на скамейке, рука на плече; подросток кивает. */
function Mentor() {
  const m = pose(76, 76, 0.76);
  const t = pose(166, 86, 0.66);
  return (
    <Scene label="Взрослый волонтёр разговаривает с подростком на скамейке">
      <Bubble x={92} y={8} w={56} tail="right" className="anim-pulse">
        <path d="M120 32 c-8 -5 -12 -9 -12 -13 a6 6 0 0 1 12 -3 a6 6 0 0 1 12 3 c0 4 -4 8 -12 13Z" fill="var(--p-pop-2)" />
      </Bubble>
      <Figure p={m} delay={0.8} person={{ skin: SKIN.mid, hair: HAIR.dark, style: "short", top: "sweater", color: C.peach, scarf: true, mood: "interest", look: [1.6, 0.2] }} />
      <Figure p={t} delay={2.2} person={{ skin: SKIN.light, hair: HAIR.brown, style: "ponytail", top: "tshirt", color: C.cyan, mood: "joy", look: [-1.6, 0.2], headClass: "anim-nod" }} />
      <rect x="10" y="150" width="220" height="11" rx="5.5" fill={C.wood} />
      <rect x="30" y="160" width="8" height="30" rx="3" fill={C.woodDark} />
      <rect x="202" y="160" width="8" height="30" rx="3" fill={C.woodDark} />
      <Breathe p={m} delay={0.8}>
        <Arm from={m.p(136, 122)} elbow={[124, 140]} to={[138, 126]} sleeve={C.peach} skin={SKIN.mid} k={m.k} />
      </Breathe>
    </Scene>
  );
}

/** 3. Специалист — психолог, логопед, юрист: консультация за столом, реплики по очереди. */
function Specialist() {
  const s = pose(66, 82, 0.72);
  const b = pose(178, 88, 0.68);
  return (
    <Scene label="Волонтёр-специалист консультирует подростка за столом">
      <Bubble x={34} y={6} w={52} tail="right" className="anim-talk-a">
        {[50, 60, 70].map((cx) => (
          <circle key={cx} cx={cx} cy="21" r="3" fill="var(--p-accent)" />
        ))}
      </Bubble>
      <Bubble x={150} y={12} w={52} tail="left" className="anim-talk-b">
        {[166, 176, 186].map((cx) => (
          <circle key={cx} cx={cx} cy="27" r="3" fill="var(--p-pop-2)" />
        ))}
      </Bubble>
      <Figure p={s} delay={0.2} person={{ skin: SKIN.light, hair: HAIR.brown, style: "short", top: "cardigan", color: C.mustard, glasses: true, scarf: true, mood: "interest", look: [1.6, 0.4] }} />
      <Figure p={b} delay={1.9} person={{ skin: SKIN.mid, hair: HAIR.brown, style: "curly", top: "sweater", color: C.blue, mood: "focus", look: [-1.6, 0.6] }} />
      <Table y={148} />
      <rect x="92" y="136" width="42" height="15" rx="2.5" fill="#fff" transform="rotate(-4 113 143)" />
      <path d="M98 141 h26 M98 146 h18" stroke="var(--p-soft)" strokeWidth="2" strokeLinecap="round" />
      <Breathe p={s} delay={0.2} className="anim-bob">
        <Arm from={s.p(136, 122)} elbow={[100, 146]} to={[110, 141]} sleeve={C.mustard} skin={SKIN.light} k={s.k} />
        <path d="M114 138 l9 -8" stroke="var(--logo-blue)" strokeWidth="2.6" strokeLinecap="round" />
      </Breathe>
      <Breathe p={b} delay={1.9}>
        <Arm from={b.p(58, 124)} elbow={[150, 152]} to={[140, 150]} sleeve={C.blue} skin={SKIN.mid} k={b.k} />
      </Breathe>
    </Scene>
  );
}

/** 4. Ярмарки и фото: прилавок с работами мастерских, волонтёр фотографирует — вспышка. */
function FairAndPhoto() {
  const v = pose(180, 78, 0.76);
  return (
    <Scene label="Волонтёр фотографирует прилавок благотворительной ярмарки" circle={[140, 112]}>
      {/* прилавок: полосатый навес, стойки, работы мастерских */}
      <rect x="18" y="44" width="5" height="110" rx="2" fill={C.woodDark} />
      <rect x="105" y="44" width="5" height="110" rx="2" fill={C.woodDark} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <g key={i}>
          <rect x={10 + i * 13} y="28" width="13" height="18" fill={i % 2 ? "#fff" : tint("var(--p-pop-2)", 25)} />
          <circle cx={16.5 + i * 13} cy="46" r="6.5" fill={i % 2 ? "#fff" : tint("var(--p-pop-2)", 25)} />
        </g>
      ))}
      <rect x="8" y="112" width="112" height="52" rx="7" fill={C.cyan} />
      <rect x="8" y="112" width="112" height="7" rx="3.5" fill={shade(C.cyan, 8)} />
      <path d="M26 112 C20 100 24 90 30 86 L36 86 C42 90 46 100 40 112Z" fill={CLAY} />
      <rect x="52" y="96" width="16" height="16" rx="3" fill="#fff" />
      <path d="M68 100 a4 4 0 0 1 0 8" stroke="#fff" strokeWidth="2.6" fill="none" />
      <rect x="52" y="101" width="16" height="3" fill={tint("var(--p-pop-2)", 30)} />
      <circle cx="90" cy="104" r="8" fill={C.mustard} />
      <circle cx="85" cy="97" r="3" fill={C.mustard} />
      <circle cx="95" cy="97" r="3" fill={C.mustard} />
      <Figure p={v} delay={1.1} person={{ skin: SKIN.light, hair: HAIR.brown, style: "beanie", hat: tint("var(--logo-berry)", 25), top: "sweater", color: C.blue, scarf: true, mood: "joy", look: [-1.6, 0.6] }}>
        {/* фотоаппарат и руки, которые его держат */}
        <rect x="122" y="104" width="32" height="22" rx="5" fill={tint("var(--p-ink)", 15)} />
        <rect x="128" y="100" width="10" height="6" rx="2" fill={tint("var(--p-ink)", 15)} />
        <circle cx="137" cy="115" r="7" fill={tint("var(--p-ink)", 55)} />
        <circle cx="137" cy="115" r="3.6" fill="var(--p-ink)" />
        <circle cx="138.3" cy="113.6" r="1.2" fill="#fff" />
        <Arm from={v.p(58, 124)} elbow={[146, 148]} to={[150, 128]} sleeve={C.blue} skin={SKIN.light} k={v.k} angle={-80} />
        <Arm from={v.p(136, 122)} elbow={[196, 156]} to={[158, 132]} sleeve={C.blue} skin={SKIN.light} k={v.k} />
      </Figure>
      <path className="anim-flash" d="M116 88 l3 6 l6 -1 l-4 5 l4 5 l-6 -1 l-3 6 l-2 -6 l-6 1 l4 -5 l-4 -5 l6 1Z" fill="var(--p-pop)" />
    </Scene>
  );
}

/** 5. Ведёт творческое занятие: мазок кистью сам появляется на холсте. */
function Painting() {
  const p = pose(70, 80, 0.76);
  return (
    <Scene label="Волонтёр ведёт занятие по живописи" circle={[110, 112]}>
      <path d="M172 50 L150 188 M172 50 L196 188 M172 50 V188" stroke={C.woodDark} strokeWidth="5" strokeLinecap="round" />
      <rect x="134" y="34" width="76" height="68" rx="4" fill="#fff" />
      <circle cx="152" cy="52" r="7" fill="var(--p-pop)" />
      <path d="M140 96 l18 -18 l12 10 l10 -8 l26 16Z" fill={tint("var(--logo-green)", 40)} />
      <path className="anim-draw" pathLength={100} d="M146 70 C158 50 172 80 200 48" stroke="var(--logo-blue)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="132" y="102" width="80" height="6" rx="3" fill={C.wood} />
      <Figure p={p} delay={0.6} person={{ skin: SKIN.light, hair: HAIR.dark, style: "ponytail", top: "sweater", color: C.peach, scarf: true, mood: "focus", look: [1.8, -0.4] }} />
      <Breathe p={p} delay={0.6} className="anim-bob">
        <Arm from={p.p(136, 122)} elbow={[120, 140]} to={[128, 112]} sleeve={C.peach} skin={SKIN.light} k={p.k} />
        <path d="M131 106 l13 -15" stroke={C.woodDark} strokeWidth="3" strokeLinecap="round" />
        <path d="M144 91 l3.4 -4" stroke="var(--logo-blue)" strokeWidth="4.4" strokeLinecap="round" />
      </Breathe>
    </Scene>
  );
}

/** 6. Валяние и рукоделие: клубок крутится, спицы двигаются. */
function Felting() {
  const f = pose(66, 80, 0.74);
  const g = pose(178, 100, 0.6);
  return (
    <Scene label="Волонтёрка учит ребёнка валять из шерсти">
      <Figure p={f} delay={1.3} person={{ skin: SKIN.light, hair: HAIR.dark, style: "long", top: "sweater", color: C.berry, scarf: true, mood: "focus", look: [1.6, 1.4] }} />
      <Figure p={g} delay={0.3} person={{ skin: SKIN.light, hair: HAIR.brown, style: "ponytail", top: "tshirt", color: C.cyan, kid: true, mood: "joy", look: [-1.6, 1] }} />
      <Table y={152} />
      <path d="M118 128 C130 140 136 146 140 140" stroke="var(--logo-cyan)" strokeWidth="2" fill="none" />
      <g className="anim-yarn">
        <circle cx="146" cy="140" r="12" fill="var(--logo-cyan)" />
        <path d="M136 136 C142 132 150 134 156 140 M138 146 C144 140 152 142 156 146 M142 130 C148 136 148 144 144 152" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.7" />
      </g>
      <Breathe p={f} delay={1.3}>
        <g className="anim-needles">
          <path d="M100 142 L124 118 M102 118 L124 140" stroke={C.woodDark} strokeWidth="2.6" strokeLinecap="round" />
        </g>
        <Arm from={f.p(136, 122)} elbow={[98, 150]} to={[108, 138]} sleeve={C.berry} skin={SKIN.light} k={f.k} />
      </Breathe>
      <Breathe p={g} delay={0.3}>
        <Arm from={g.p(72, 114)} elbow={[160, 146]} to={[156, 142]} sleeve={C.cyan} skin={SKIN.light} k={g.k} short />
      </Breathe>
    </Scene>
  );
}

/** 7. Кулинарный мастер-класс: венчик мешает тесто, над миской пар. */
function Cooking() {
  const c = pose(64, 80, 0.74);
  const k = pose(180, 100, 0.6);
  return (
    <Scene label="Волонтёр готовит с ребёнком на кулинарном мастер-классе">
      <Figure p={c} delay={2} person={{ skin: SKIN.mid, hair: HAIR.brown, style: "beanie", hat: "#ffffff", top: "shirt", color: C.cyan, scarf: true, mood: "joy", look: [1.6, 1.4] }} />
      <Figure p={k} delay={0.9} person={{ skin: SKIN.light, hair: HAIR.brown, style: "curly", top: "tshirt", color: C.yellow, kid: true, mood: "joy", look: [-1.6, 1.2] }} />
      <Table y={152} />
      {[108, 120, 132].map((x, i) => (
        <path key={x} className={`anim-steam anim-steam-${i + 1}`} d={`M${x} 126 c-4 -6 4 -10 0 -16`} stroke={C.steam} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ))}
      <path d="M94 136 h52 a26 17 0 0 1 -52 0Z" fill="#fff" />
      <path d="M97 143 h46" stroke={tint("var(--logo-cyan)", 40)} strokeWidth="3" />
      <ellipse cx="120" cy="137" rx="24" ry="4" fill={tint("var(--p-pop)", 55)} />
      <g className="anim-stir">
        <path d="M118 140 L132 110" stroke={C.woodDark} strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="117" cy="141" rx="5" ry="3" fill="none" stroke={tint("var(--p-ink)", 50)} strokeWidth="2" />
      </g>
      <Breathe p={c} delay={2}>
        <Arm from={c.p(136, 122)} elbow={[112, 134]} to={[126, 116]} sleeve={C.cyan} skin={SKIN.mid} k={c.k} />
      </Breathe>
      <Breathe p={k} delay={0.9}>
        <Arm from={k.p(72, 114)} elbow={[158, 146]} to={[148, 142]} sleeve={C.yellow} skin={SKIN.light} k={k.k} short />
      </Breathe>
    </Scene>
  );
}

/** 8. Выезды и прогулки: идут рядом, светит солнце. */
function Walk() {
  const o = pose(78, 78, 0.74);
  const t = pose(150, 88, 0.66);
  return (
    <Scene label="Волонтёр гуляет с подростком">
      <g className="anim-pulse">
        <circle cx="34" cy="34" r="19" fill={tint("var(--p-pop)", 60)} />
        <circle cx="34" cy="34" r="12" fill="var(--p-pop)" />
      </g>
      <rect x="201" y="96" width="10" height="96" rx="4" fill={C.woodDark} />
      <circle cx="206" cy="82" r="27" fill={tint("var(--logo-green)", 30)} />
      <circle cx="196" cy="74" r="12" fill={tint("var(--logo-green)", 45)} />
      {([[194, 90], [212, 74], [216, 94], [202, 64]] as [number, number][]).map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="3.2" fill="var(--p-pop-2)" />
      ))}
      <Figure p={o} delay={0.5} wrap="anim-bob" person={{ skin: SKIN.light, hair: HAIR.grey, style: "short", top: "sweater", color: C.blue, glasses: true, scarf: true, mood: "joy", look: [1.6, 0] }} />
      <Figure p={t} delay={1.8} wrap="anim-bob-late" person={{ skin: SKIN.light, hair: HAIR.brown, style: "curly", top: "tshirt", color: tint("var(--logo-orange)", 30), mood: "joy", look: [-1.6, 0] }} />
    </Scene>
  );
}

/** 9. Онлайн-помощь: тексты, дизайн, переводы — строки сами набираются на экране. */
function Online() {
  const w = pose(68, 80, 0.74);
  return (
    <Scene label="Волонтёрка помогает фонду онлайн за ноутбуком">
      <Figure p={w} delay={1.5} person={{ skin: SKIN.light, hair: HAIR.dark, style: "short", top: "sweater", color: C.cyan, glasses: true, scarf: true, mood: "focus", look: [1.8, 1.2] }} />
      <Table y={150} />
      <rect x="112" y="90" width="72" height="52" rx="5" fill={tint("var(--p-ink)", 20)} />
      <rect x="116" y="94" width="64" height="44" rx="3" fill="#fff" />
      {[102, 112, 122].map((y, i) => (
        <rect key={y} className={`anim-fill anim-fill-${i + 1}`} x="122" y={y} width={i === 2 ? 32 : 50} height="5" rx="2.5" fill={i === 1 ? "var(--logo-cyan)" : "var(--p-accent)"} />
      ))}
      <path d="M102 150 h92 l-8 -8 h-76Z" fill={tint("var(--p-ink)", 40)} />
      <rect x="202" y="132" width="16" height="18" rx="4" fill="#fff" />
      <path d="M218 136 a4 4 0 0 1 0 9" stroke="#fff" strokeWidth="2.6" fill="none" />
      <path className="anim-steam anim-steam-2" d="M210 126 c-3 -5 3 -8 0 -13" stroke={C.steam} strokeWidth="2" fill="none" strokeLinecap="round" />
      <Breathe p={w} delay={1.5} className="anim-bob">
        <Arm from={w.p(136, 122)} elbow={[112, 150]} to={[128, 146]} sleeve={C.cyan} skin={SKIN.light} k={w.k} />
      </Breathe>
      <Breathe p={w} delay={1.5} className="anim-bob-late">
        <Arm from={w.p(58, 124)} elbow={[62, 156]} to={[112, 148]} sleeve={C.cyan} skin={SKIN.light} k={w.k} />
      </Breathe>
    </Scene>
  );
}

/** 10. Водитель: везёт работы мастерских на ярмарку — колёса крутятся, дорога бежит. */
function Driver() {
  const d = pose(114, 88, 0.26);
  return (
    <Scene label="Волонтёр-водитель везёт работы мастерских на ярмарку">
      <g transform="translate(0 -6) scale(1.2)">
        <g className="anim-road">
          {[0, 40, 80, 120, 160, 200].map((x) => (
            <rect key={x} x={x} y="142" width="22" height="4" rx="2" fill={shade("var(--p-soft)", 12)} />
          ))}
        </g>
        <ellipse cx="100" cy="134" rx="62" ry="5" fill={shade("var(--p-soft)", 10)} />
        <g className="anim-bob">
          <rect x="60" y="58" width="22" height="16" rx="3" fill={CLAY} />
          <path d="M60 64 h22" stroke={shade(CLAY, 15)} strokeWidth="1.6" />
          <rect x="84" y="62" width="18" height="12" rx="3" fill={C.mustard} />
          <path d="M44 120 V100 q0 -10 10 -10 h24 l14 -14 h34 q8 0 12 8 l8 16 q8 2 8 10 v10Z" fill={tint("var(--logo-blue)", 25)} />
          <path d="M44 112 h110" stroke={shade(tint("var(--logo-blue)", 25), 10)} strokeWidth="2" />
          <clipPath id="vs-window">
            <path d="M96 80 h28 q4 0 6 4 l6 12 h-40Z" />
          </clipPath>
          <path d="M96 80 h28 q4 0 6 4 l6 12 h-40Z" fill={tint("var(--logo-cyan)", 65)} />
          <g clipPath="url(#vs-window)">
            <g transform={d.at}>
              <FlatPerson skin={SKIN.light} hair={HAIR.dark} style="short" top="sweater" color={C.peach} scarf mood="joy" look={[1.6, 0]} blink={0.7} />
            </g>
          </g>
          <path d="M126 82 l6 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <rect x="150" y="104" width="8" height="5" rx="2" fill="var(--p-pop)" />
        </g>
        {[68, 132].map((cx) => (
          <g key={cx} className="anim-wheel">
            <circle cx={cx} cy="122" r="12" fill={tint("var(--p-ink)", 15)} />
            <circle cx={cx} cy="122" r="5.5" fill={tint("var(--p-ink)", 75)} />
            <path d={`M${cx} 115 v14 M${cx - 7} 122 h14`} stroke={tint("var(--p-ink)", 75)} strokeWidth="2" />
          </g>
        ))}
      </g>
    </Scene>
  );
}

/** 11. Медиатор на выставке: рассказывает ребёнку о картине, тот кивает. */
function Exhibition() {
  const m = pose(64, 84, 0.74);
  const k = pose(182, 120, 0.54);
  return (
    <Scene label="Волонтёр-медиатор рассказывает ребёнку о картине на выставке">
      <rect x="112" y="16" width="94" height="64" rx="3" fill="#fff" stroke={C.woodDark} strokeWidth="6" />
      <circle cx="186" cy="34" r="6.5" fill="var(--p-pop)" />
      <path d="M118 76 l22 -24 l16 14 l12 -10 l32 20Z" fill={tint("var(--logo-green)", 25)} />
      <Figure p={m} delay={0.9} person={{ skin: SKIN.light, hair: HAIR.brown, style: "bun", top: "cardigan", color: C.mustard, scarf: true, mood: "joy", look: [1.8, -1] }}>
        <Arm className="anim-bob" from={m.p(136, 122)} elbow={[112, 116]} to={[120, 94]} sleeve={C.mustard} skin={SKIN.light} k={m.k} />
      </Figure>
      <Figure p={k} delay={2.4} person={{ skin: SKIN.light, hair: HAIR.dark, style: "short", top: "tshirt", color: C.cyan, kid: true, mood: "joy", look: [-1.6, -1.6], headClass: "anim-nod" }} />
    </Scene>
  );
}

/** 12. Обучение: буквы сами появляются на доске. */
function Teaching() {
  const t = pose(62, 84, 0.74);
  const k = pose(188, 122, 0.52);
  return (
    <Scene label="Волонтёр занимается с ребёнком у доски" circle={[110, 114]}>
      <rect x="104" y="14" width="124" height="72" rx="6" fill="var(--p-accent)" />
      <rect x="104" y="86" width="124" height="5" rx="2.5" fill={C.wood} />
      <path
        className="anim-draw"
        pathLength={100}
        transform="translate(26 -4)"
        d="M104 66 l8 -26 l8 26 M108 56 h8 M128 40 v26 h10 q8 0 8 -7 q0 -7 -8 -7 h-10 M152 40 v26"
        stroke="#fff"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Figure p={t} delay={1.7} person={{ skin: SKIN.light, hair: HAIR.grey, style: "short", top: "shirt", color: C.peach, glasses: true, scarf: true, mood: "interest", look: [1.8, -0.6] }}>
        <g className="anim-bob">
          <Arm from={t.p(136, 122)} elbow={[110, 118]} to={[122, 72]} sleeve={C.peach} skin={SKIN.light} k={t.k} />
        </g>
      </Figure>
      <Figure p={k} delay={0.2} person={{ skin: SKIN.light, hair: HAIR.brown, style: "ponytail", top: "tshirt", color: C.berry, kid: true, mood: "joy", look: [-1.6, -1.6] }} />
    </Scene>
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
