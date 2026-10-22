// Иллюстрации блока «Как всё устроено» (Journey.tsx): одна и та же волонтёрка в трёх сценах.
// Плоский мягкий стиль без чёрной обводки: тени — тот же цвет, смешанный с --p-ink, блики — с белым.
// Анимируемые части — отдельные <g> с классами jr-* (index.css), transform-origin задан в px внутри viewBox.
import { CLAY, Eye, HAIR, Hand, Mouth, SKIN, Sleeve, shade, tint, type Mood } from "./FlatPeople";

/** Героиня всех трёх шагов: каштановые волосы до плеч, голубой свитер, зелёный шарф волонтёра фонда. */
const HERO = {
  skin: SKIN.light,
  hair: HAIR.brown,
  sweater: tint("var(--logo-cyan)", 58),
  scarf: "var(--p-accent)",
};

/** Голова героини (центр лица ≈ 97, 66). look — куда смотрят глаза, mood — бровями и ртом. */
function HeroHead(props: { look?: [number, number]; mood: Mood }) {
  const { skin, hair } = HERO;
  const [lx, ly] = props.look ?? [0, 0];
  const brows =
    props.mood === "focus"
      ? "M83 57.5 q5 -2.6 9.5 0.6 M102 58 q4.6 -3.2 9.5 -0.8"
      : "M83 56 q5 -3.6 9.5 -1.2 M102 54.8 q4.6 -2.4 9.5 1.2";
  return (
    <g className="jr-head">
      {/* уши с тенью внутри */}
      <circle cx="75.5" cy="69" r="5.2" fill={skin} />
      <path d="M74 66.5 q-2 2.6 0.4 5" stroke={shade(skin, 18)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="118.5" cy="69" r="5.2" fill={skin} />
      <path d="M120 66.5 q2 2.6 -0.4 5" stroke={shade(skin, 18)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* лицо */}
      <path d="M75 62 C75 45 85 39 97 39 C109 39 119 45 119 62 C119 79 110 90 97 90 C84 90 75 79 75 62Z" fill={skin} />
      {/* волосы, передний слой: чёлка набок и пряди по бокам */}
      <path d="M73 66 C69 41 85 29 100 30 C117 31 128 44 121 67 C119 55 113 47 105 44.5 C97 53 86 60 73 66Z" fill={hair} />
      <path d="M73.5 60 C70 74 71.5 88 76 97 C80 88 80.5 74 78.5 61Z" fill={hair} />
      <path d="M120.5 60 C124 74 122.5 88 118 97 C114 88 113.5 74 115.5 61Z" fill={hair} />
      <path d="M88 37 C96 33.5 106 34 113 39.5" stroke={tint(hair, 32)} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* брови */}
      <path d={brows} stroke={shade(hair, 15)} strokeWidth="2.1" fill="none" strokeLinecap="round" />
      {/* глаза моргают вместе: scaleY от центра глаз */}
      <g className="jr-blink" style={{ transformOrigin: "97px 68px" }}>
        <Eye x={88.5} y={68} dx={lx} dy={ly} />
        <Eye x={105.5} y={68} dx={lx} dy={ly} />
      </g>
      {/* румянец, нос */}
      <ellipse cx="83.5" cy="78" rx="4.4" ry="2.6" fill="var(--p-pop-2)" opacity="0.2" />
      <ellipse cx="111" cy="78" rx="4.4" ry="2.6" fill="var(--p-pop-2)" opacity="0.2" />
      <path d="M98 71.5 q2.2 3.2 -0.8 4.4" stroke={shade(skin, 22)} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Mouth mood={props.mood} />
    </g>
  );
}

/** Шея, свитер, шарф. Тело дышит вместе с головой — группа jr-breathe в сцене. */
function HeroBody() {
  const { skin, sweater, scarf, hair } = HERO;
  return (
    <>
      {/* волосы, задний слой — темнее переднего */}
      <path d="M70 66 C66 38 84 26 98 26 C117 26 133 39 128 66 L131 110 C122 117 112 116 106 110 L90 110 C82 117 71 116 65 110Z" fill={shade(hair, 22)} />
      {/* свитер: плечи, складки, тень сбоку */}
      <path d="M38 192 C38 158 41 128 56 116 C66 108 78 104 88 103 L106 103 C116 104 128 108 138 116 C153 128 156 158 156 192Z" fill={sweater} />
      <path d="M138 116 C151 127 155 156 156 192 L148 192 C148 160 146 134 138 116Z" fill={shade(sweater, 9)} />
      <path d="M68 150 q5 12 3 26 M122 148 q-3 12 1 26" stroke={shade(sweater, 12)} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* шея с тенью под подбородком */}
      <path d="M88 86 L88 106 Q97 112 106 106 L106 86Z" fill={skin} />
      <path d="M88 87 Q97 99 106 87 L106 95 Q97 104 88 95Z" fill={shade(skin, 14)} />
      {/* шарф: петля вокруг шеи и свисающий конец с полосками и бахромой */}
      <path d="M81 100 C89 113 106 113 114 100 L119 108 C109 123 87 123 77 108Z" fill={scarf} />
      <path d="M85 110 C93 117 104 117 112 109" stroke={shade(scarf, 22)} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M100 113 C104 125 106 137 104 150 L115 150 C117 137 115 122 109 111Z" fill={scarf} />
      <path d="M103.5 128 h11 M104 138 h11.5" stroke={tint(scarf, 38)} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M105 150 v5 M108.5 150 v5.5 M112 150 v5 M115 150 v4.5" stroke={scarf} strokeWidth="1.8" strokeLinecap="round" />
    </>
  );
}

/** Кисть, тапающая по экрану: ладонь с поджатыми пальцами и вытянутый указательный. */
function TapHand() {
  const { skin, sweater } = HERO;
  return (
    <g className="jr-tap" style={{ transformOrigin: "120px 150px" }}>
      {/* рукав: плечо → локоть → предплечье к телефону */}
      <path d="M56 124 C50 146 52 164 64 172 C84 168 102 156 116 147" stroke={shade(sweater, 9)} strokeWidth="22" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 124 C50 146 52 164 64 172 C84 168 102 156 116 147" stroke={sweater} strokeWidth="19" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 150 C53 162 57 168 64 172" stroke={shade(sweater, 10)} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* манжета */}
      <path d="M111 141 l9 12" stroke={shade(sweater, 8)} strokeWidth="7" strokeLinecap="round" />
      {/* ладонь и пальцы */}
      <g fill={skin}>
        <path d="M117 139 C121 133 130 132 134 137 C137 141 135 148 129 151 C124 153 118 151 116 146 C115 144 115.5 141 117 139Z" />
        <path d="M128 138 L139 126.5" stroke={skin} strokeWidth="5.4" strokeLinecap="round" />
      </g>
      <path d="M124 147 q4 1 7 -1.5 M123 143.5 q4 1 7.5 -1.4" stroke={shade(skin, 18)} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M117 139 C116 136 117.5 133.5 120.5 133.5" stroke={skin} strokeWidth="4.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Телефон с анкетой в руке: поля заполняются, внизу пружинкой появляется галочка. */
function PhoneWithForm() {
  const { skin, sweater } = HERO;
  return (
    <g>
      {/* рука, держащая телефон снизу: рукав от плеча, ладонь под телефоном */}
      <path d="M138 122 C150 138 156 158 156 178 C160 176 166 172 170 168" stroke={shade(sweater, 9)} strokeWidth="22" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M138 122 C150 138 156 158 156 178 C160 176 166 172 170 168" stroke={sweater} strokeWidth="19" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M150 140 C154 152 156 164 156 178" stroke={shade(sweater, 10)} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M163 171 l8 -9" stroke={shade(sweater, 8)} strokeWidth="7" strokeLinecap="round" />
      <g transform="rotate(8 158 128)">
        <rect x="136" y="88" width="44" height="78" rx="9" fill="var(--p-ink)" />
        <rect x="139.5" y="94" width="37" height="66" rx="5" fill="#fff" />
        <rect x="152" y="90.3" width="12" height="2" rx="1" fill={tint("var(--p-ink)", 55)} />
        {[102, 114, 126].map((y, i) => (
          <g key={y}>
            <rect x="143.5" y={y} width="29" height="6.5" rx="3.25" fill="var(--p-surface)" />
            <rect className={`jr-fill jr-fill-${i + 1}`} x="143.5" y={y} width={i === 2 ? 20 : 29} height="6.5" rx="3.25" fill={tint("var(--p-accent)", 55)} />
          </g>
        ))}
        <g className="jr-check" style={{ transformOrigin: "158px 146px" }}>
          <circle cx="158" cy="146" r="7.5" fill="var(--p-accent)" />
          <path d="M154.2 146 l2.8 2.8 l5 -5.4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      {/* пальцы обхватывают правый край, большой палец — снизу спереди */}
      <g fill={skin}>
        <path d="M160 164 C166 160 175 160 178 165 C180 170 175 175 168 175 C163 175 159 170 160 164Z" />
        {[147, 154, 161].map((y) => (
          <rect key={y} x="176" y={y} width="7" height="5.6" rx="2.8" transform={`rotate(8 158 128)`} />
        ))}
        <path d="M161 166 C157 163 152 163 149 165" stroke={skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Шаг 1. Волонтёрка заполняет анкету на телефоне: сосредоточенно тапает по экрану. */
export function StepFormIllustration() {
  return (
    <svg viewBox="0 0 240 192" className="jr-art h-auto w-full" role="img" aria-label="Волонтёрка заполняет анкету на телефоне">
      <circle cx="112" cy="112" r="74" fill="var(--p-soft)" />
      <circle cx="200" cy="40" r="6" fill="var(--p-pop)" opacity="0.7" />
      <circle cx="28" cy="70" r="4" fill="var(--p-accent)" opacity="0.35" />
      <g className="jr-breathe" style={{ transformOrigin: "97px 192px" }}>
        <HeroBody />
        <HeroHead look={[1.4, 1.4]} mood="focus" />
        <PhoneWithForm />
        <TapHand />
      </g>
    </svg>
  );
}

// ===== Общие детали для сцен 2 и 3 =====

/** Голова и тело героини целиком, в своих координатах (лицо ≈ 97, 66). */
function Hero(props: { look: [number, number]; mood: Mood }) {
  return (
    <>
      <HeroBody />
      <HeroHead look={props.look} mood={props.mood} />
    </>
  );
}

// ===== Шаг 2. Обучение и знакомство =====

const GRANNY = {
  skin: SKIN.mid,
  hair: HAIR.grey,
  cardigan: tint("var(--logo-berry)", 55),
};

/** Пожилая участница: седой пучок, круглые очки, кардиган на пуговицах поверх белой блузки. Кивает. */
function Granny() {
  const { skin, hair, cardigan } = GRANNY;
  const frame = shade(skin, 55);
  return (
    <>
      {/* кардиган, блузка с воротничком, пуговицы, карман */}
      <path d="M38 192 C38 158 41 128 56 116 C66 108 78 104 88 103 L106 103 C116 104 128 108 138 116 C153 128 156 158 156 192Z" fill={cardigan} />
      <path d="M138 116 C151 127 155 156 156 192 L148 192 C148 160 146 134 138 116Z" fill={shade(cardigan, 9)} />
      <path d="M86 103 L97 130 L108 103Z" fill="#fff" />
      <path d="M86 103 L79 113 L93 115Z M108 103 L115 113 L101 115Z" fill={tint("var(--p-soft)", 40)} />
      <path d="M97 130 V192" stroke={shade(cardigan, 12)} strokeWidth="2" strokeLinecap="round" />
      {[142, 158, 174].map((y) => (
        <circle key={y} cx="101" cy={y} r="2.6" fill={tint(cardigan, 60)} />
      ))}
      <path d="M68 150 q5 12 3 26" stroke={shade(cardigan, 12)} strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="112" y="156" width="20" height="15" rx="4" fill={shade(cardigan, 6)} />
      <path d="M112 160 h20" stroke={shade(cardigan, 14)} strokeWidth="1.6" />
      {/* шея с тенью */}
      <path d="M89 86 L89 104 Q97 109 105 104 L105 86Z" fill={skin} />
      <path d="M89 87 Q97 98 105 87 L105 94 Q97 102 89 94Z" fill={shade(skin, 14)} />
      <g className="jr-nod" style={{ transformOrigin: "97px 100px" }}>
        {/* пучок: задний слой волос */}
        <circle cx="97" cy="31" r="12" fill={shade(hair, 12)} />
        <path d="M89 29 q8 -8 16 0" stroke={tint(hair, 40)} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="75.5" cy="69" r="5.2" fill={skin} />
        <path d="M74 66.5 q-2 2.6 0.4 5" stroke={shade(skin, 18)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="118.5" cy="69" r="5.2" fill={skin} />
        <path d="M120 66.5 q2 2.6 -0.4 5" stroke={shade(skin, 18)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M75 62 C75 45 85 39 97 39 C109 39 119 45 119 62 C119 79 110 90 97 90 C84 90 75 79 75 62Z" fill={skin} />
        {/* седые волосы, гладко зачёсаны к пучку, передний слой с волной */}
        <path d="M73.5 66 C70 44 83 34 97 34 C111 34 124 44 120.5 66 C118 56 112 49 104 47 C99 50 94 50 89 47 C82 49 76 56 73.5 66Z" fill={hair} />
        <path d="M84 40 C90 37 98 36.5 106 38.5" stroke={tint(hair, 55)} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M83.5 58.5 q5 -2.4 9.5 -0.6 M102 57.9 q4.6 -1.8 9.5 0.6" stroke={shade(hair, 30)} strokeWidth="1.9" fill="none" strokeLinecap="round" />
        <g className="jr-blink" style={{ transformOrigin: "97px 68px", ["--d" as string]: "2.6s" }}>
          <Eye x={88.5} y={68} dx={-1.2} dy={0.4} k={0.85} />
          <Eye x={105.5} y={68} dx={-1.2} dy={0.4} k={0.85} />
        </g>
        {/* морщинки у глаз и улыбки */}
        <path d="M79.5 66 l-2.4 -1 M79.5 69.5 l-2.6 0.6 M114.5 66 l2.4 -1 M114.5 69.5 l2.6 0.6 M86.5 80 q-1.6 2.4 0 4.6 M107.5 80 q1.6 2.4 0 4.6" stroke={shade(skin, 20)} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <g stroke={frame} strokeWidth="1.8" fill="#fff" fillOpacity="0.25">
          <circle cx="88.5" cy="68.5" r="6.4" />
          <circle cx="105.5" cy="68.5" r="6.4" />
          <path d="M94.9 68 h4.2" fill="none" />
        </g>
        <ellipse cx="83" cy="78.5" rx="4.2" ry="2.5" fill="var(--p-pop-2)" opacity="0.2" />
        <ellipse cx="111" cy="78.5" rx="4.2" ry="2.5" fill="var(--p-pop-2)" opacity="0.2" />
        <path d="M98 71.5 q2.2 3.2 -0.8 4.4" stroke={shade(skin, 22)} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <Mouth mood="interest" y={81} />
      </g>
    </>
  );
}

/** Шаг 2. Знакомство и короткий курс: волонтёрка листает карточки, бабушка с чашкой кивает,
 *  над ними «пузырь» с полосой прогресса курса. */
export function StepTrainingIllustration() {
  const heroAt = "translate(-4 32) scale(0.78)";
  const grannyAt = "translate(100 30) scale(0.78)";
  const table = tint("var(--p-pop)", 70);
  return (
    <svg viewBox="0 0 240 192" className="jr-art h-auto w-full" role="img" aria-label="Волонтёрка знакомится с координатором и проходит короткий курс">
      <circle cx="120" cy="112" r="78" fill="var(--p-soft)" />
      {/* пузырь диалога: книжка и полоса прогресса курса */}
      <g className="jr-bubble">
        <rect x="80" y="8" width="80" height="32" rx="14" fill="#fff" />
        <path d="M128 39 l8 9 l1 -10Z" fill="#fff" />
        <path d="M92 18 q5 -2 9 0.6 v12 q-4 -2.6 -9 -0.6Z M101 18.6 q4 -2.6 9 -0.6 v12 q-5 -2 -9 0.6Z" fill={tint("var(--p-accent)", 20)} />
        <rect x="116" y="21" width="34" height="7" rx="3.5" fill="var(--p-surface)" />
        <rect className="jr-fill jr-fill-slow" x="116" y="21" width="34" height="7" rx="3.5" fill="var(--p-accent)" />
      </g>
      <g className="jr-alive">
        <g className="jr-breathe" style={{ transformOrigin: "75px 182px" }}>
          <g transform={heroAt}>
            <Hero look={[1.6, 0.2]} mood="interest" />
            {/* левая рука лежит на столе */}
            <Sleeve d="M56 124 C47 146 53 156 70 158 L90 158" color={HERO.sweater} />
          </g>
        </g>
      </g>
      <g className="jr-alive jr-alive-late">
        <g className="jr-breathe" style={{ transformOrigin: "176px 180px", animationDelay: "-1.4s" }}>
          <g transform={grannyAt}>
            <Granny />
            <Sleeve d="M138 122 C148 140 152 152 150 166" color={GRANNY.cardigan} />
          </g>
        </g>
      </g>
      {/* стол */}
      <rect x="-4" y="154" width="248" height="42" rx="8" fill={table} />
      <path d="M0 156 H240" stroke={tint(table, 45)} strokeWidth="2.4" />
      {/* чашка бабушки: пар поднимается, рука обхватывает чашку */}
      <path d="M163 130 c-3 -5 3 -8 0 -13" className="jr-steam" stroke={tint("var(--p-ink)", 70)} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M156 136 h18 v12 a6 6 0 0 1 -6 6 h-6 a6 6 0 0 1 -6 -6Z" fill="#fff" />
      <path d="M174 139 a4.5 4.5 0 0 1 0 9" stroke="#fff" strokeWidth="3" fill="none" />
      <path d="M156 140 h18" stroke={tint("var(--p-pop-2)", 40)} strokeWidth="2.4" />
      <g transform={grannyAt}>
        <Sleeve d="M56 124 C48 142 56 154 66 157" color={GRANNY.cardigan} />
        <Hand x={72} y={157} angle={-8} skin={GRANNY.skin} k={1.15} />
      </g>
      {/* волонтёрка листает карточки курса: верхняя переворачивается */}
      <g className="jr-breathe" style={{ transformOrigin: "75px 182px" }}>
        <g transform={heroAt}>
          <Hand x={96} y={158} angle={4} skin={HERO.skin} k={1.1} />
          <Sleeve d="M138 122 C150 134 153 144 154 152" color={HERO.sweater} />
        </g>
        <rect x="108" y="106" width="26" height="34" rx="4" fill={tint("var(--logo-cyan)", 40)} transform="rotate(-8 121 123)" />
        <g className="jr-flip" style={{ transformOrigin: "112px 124px" }}>
          <rect x="112" y="106" width="26" height="34" rx="4" fill="#fff" />
          <path d="M125 117 c-4 -3 -6 -5 -6 -7 a3 3 0 0 1 6 -1.5 a3 3 0 0 1 6 1.5 c0 2 -2 4 -6 7Z" fill="var(--p-accent)" />
          <path d="M118 124 h14 M118 129.5 h10" stroke="var(--p-soft)" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <g transform={heroAt}>
          <Hand x={157} y={150} angle={-70} skin={HERO.skin} k={1.1} flip />
        </g>
      </g>
    </svg>
  );
}

// ===== Шаг 3. Занятия =====

const CHILD = {
  skin: SKIN.light,
  hair: HAIR.brown,
  shirt: "var(--p-pop)",
};

/** Ребёнок: крупная голова, узкие плечи, русые кудри в два слоя, футболка со звездой. Радуется. */
function Kid() {
  const { skin, hair, shirt } = CHILD;
  return (
    <>
      {/* задний слой кудрей */}
      {([[74, 52], [80, 38], [92, 31], [106, 31], [118, 39], [123, 53]] as [number, number][]).map(([cx, cy]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="11" fill={hair} />
      ))}
      {/* футболка с круглым воротом и звездой */}
      <path d="M56 192 C56 160 60 124 72 112 C79 105 87 102 92 102 L102 102 C107 102 115 105 122 112 C134 124 138 160 138 192Z" fill={shirt} />
      <path d="M122 112 C133 123 137 156 138 192 L131 192 C131 160 129 132 122 112Z" fill={shade(shirt, 8)} />
      <path d="M88 103 q9 8 18 0" stroke={shade(shirt, 14)} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M97 128 l3.2 6.6 l7.2 1 l-5.2 5 l1.3 7.2 l-6.5 -3.4 l-6.5 3.4 l1.3 -7.2 l-5.2 -5 l7.2 -1Z" fill="var(--p-pop-2)" />
      {/* шея */}
      <path d="M90 88 L90 104 Q97 108 104 104 L104 88Z" fill={skin} />
      <path d="M90 89 Q97 99 104 89 L104 95 Q97 102 90 95Z" fill={shade(skin, 14)} />
      <g className="jr-head" style={{ animationDelay: "-2s" }}>
        <circle cx="72" cy="68" r="5.6" fill={skin} />
        <path d="M70.5 65.5 q-2 2.6 0.4 5" stroke={shade(skin, 18)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="122" cy="68" r="5.6" fill={skin} />
        <path d="M123.5 65.5 q2 2.6 -0.4 5" stroke={shade(skin, 18)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M72 64 C72 46 83 39 97 39 C111 39 122 46 122 64 C122 82 111 93 97 93 C83 93 72 82 72 64Z" fill={skin} />
        {/* передний слой кудрей: чёлка из колечек и блик */}
        {([[77, 50, 8], [86, 42, 9], [97, 39, 9], [108, 42, 9], [117, 50, 8]] as [number, number, number][]).map(([cx, cy, r]) => (
          <circle key={cx} cx={cx} cy={cy} r={r} fill={tint(hair, 14)} />
        ))}
        <path d="M90 37 q4 -3 8 -1 M104 38 q4 -1 6 2" stroke={tint(hair, 35)} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M82.5 58 q5 -4 9.5 -1.6 M102.5 56.4 q4.6 -2.4 9.5 1.6" stroke={hair} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <g className="jr-blink" style={{ transformOrigin: "97px 68px", ["--d" as string]: "0.6s" }}>
          <Eye x={87.5} y={68} dx={-1.4} dy={1.4} k={1.2} />
          <Eye x={106.5} y={68} dx={-1.4} dy={1.4} k={1.2} />
        </g>
        <ellipse cx="81" cy="79" rx="4.8" ry="2.8" fill="var(--p-pop-2)" opacity="0.3" />
        <ellipse cx="113" cy="79" rx="4.8" ry="2.8" fill="var(--p-pop-2)" opacity="0.3" />
        <path d="M97 72 q2 2.6 -0.8 3.8" stroke={shade(skin, 22)} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <Mouth mood="joy" y={81} k={1.3} />
      </g>
    </>
  );
}

/** Шаг 3. На занятии: волонтёрка и ребёнок лепят горшок на гончарном круге, рядом баночка с кистями,
 *  над ними поднимается и пульсирует сердечко. */
export function StepLessonsIllustration() {
  const heroAt = "translate(-16 36) scale(0.78)";
  const kidAt = "translate(118 64) scale(0.64)";
  return (
    <svg viewBox="0 0 240 192" className="jr-art h-auto w-full" role="img" aria-label="Волонтёрка и ребёнок вместе лепят горшок на мастер-классе">
      <circle cx="120" cy="116" r="78" fill="var(--p-soft)" />
      <g className="jr-heart" style={{ transformOrigin: "122px 34px" }}>
        <path d="M122 46 c-11 -7 -16 -12 -16 -18 a8 8 0 0 1 16 -4 a8 8 0 0 1 16 4 c0 6 -5 11 -16 18Z" fill="var(--p-pop-2)" />
        <path d="M112 26 a4 4 0 0 1 5 -3" stroke={tint("var(--p-pop-2)", 50)} strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g className="jr-alive">
        <g className="jr-breathe" style={{ transformOrigin: "60px 186px" }}>
          <g transform={heroAt}>
            <Hero look={[1.6, 1.6]} mood="joy" />
            <Sleeve d="M56 124 C48 146 52 166 58 186" color={HERO.sweater} />
          </g>
        </g>
      </g>
      <g className="jr-alive jr-alive-late">
        <g className="jr-breathe" style={{ transformOrigin: "180px 186px", animationDelay: "-1.8s" }}>
          <g transform={kidAt}>
            <Kid />
            <Sleeve d="M124 114 C130 124 132 134 132 146" color={CHILD.shirt} w={20} />
            <path d="M132 146 L133 168" stroke={CHILD.skin} strokeWidth="11" strokeLinecap="round" />
            <Hand x={133} y={173} angle={92} skin={CHILD.skin} k={1.35} flip />
          </g>
        </g>
      </g>
      {/* гончарный круг и горшок; блик бежит по глине — круг крутится */}
      <ellipse cx="122" cy="178" rx="40" ry="10" fill={shade("var(--p-soft)", 18)} />
      <ellipse cx="122" cy="170" rx="36" ry="8" fill={tint("var(--p-ink)", 75)} />
      <ellipse cx="122" cy="168" rx="36" ry="7" fill={tint("var(--p-ink)", 85)} />
      <clipPath id="jr-pot">
        <path d="M104 168 C99 150 105 137 114 132 L130 132 C139 137 145 150 140 168Z" />
      </clipPath>
      <path d="M104 168 C99 150 105 137 114 132 L130 132 C139 137 145 150 140 168Z" fill={CLAY} />
      <path d="M131 134 C140 140 144 152 140 168 L134 168 C137 154 136 142 131 134Z" fill={shade(CLAY, 12)} />
      <ellipse cx="122" cy="132" rx="8.5" ry="2.6" fill={shade(CLAY, 22)} />
      <g clipPath="url(#jr-pot)">
        <rect className="jr-spin" x="112" y="128" width="5" height="44" fill="#fff" opacity="0.3" />
      </g>
      {/* баночка с кисточками */}
      <path d="M218 150 l-6 -30 M224 150 l4 -32" stroke={shade("var(--p-pop)", 30)} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M212 120 l-1.6 -7 M228 118 l1.4 -7" stroke="var(--p-accent)" strokeWidth="4" strokeLinecap="round" />
      <rect x="210" y="146" width="22" height="30" rx="6" fill={tint("var(--logo-cyan)", 55)} opacity="0.9" />
      <rect x="210" y="158" width="22" height="18" rx="6" fill={tint("var(--logo-cyan)", 25)} opacity="0.8" />
      {/* руки лепят: двигаются по очереди */}
      <g className="jr-mold" style={{ transformOrigin: "106px 150px" }}>
        <g transform={heroAt}>
          <Sleeve d="M138 122 C146 136 150 146 152 152" color={HERO.sweater} />
          <Hand x={156} y={154} angle={-8} skin={HERO.skin} k={1.2} />
        </g>
      </g>
      <g className="jr-mold jr-mold-late" style={{ transformOrigin: "138px 150px" }}>
        <g transform={kidAt}>
          <Sleeve d="M70 114 C62 122 58 128 54 132" color={CHILD.shirt} w={20} />
          <path d="M54 132 L36 138" stroke={CHILD.skin} strokeWidth="11" strokeLinecap="round" />
          <Hand x={32} y={139} angle={190} skin={CHILD.skin} k={1.45} flip />
        </g>
      </g>
    </svg>
  );
}
