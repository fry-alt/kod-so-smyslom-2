// Части страницы звонка: раскладка, видео, кнопки управления, индикатор микрофона.
// Логика звонка — в CallScreen.tsx и room.ts.
import { useEffect, useRef, type ReactNode } from "react";

import { FLAIR, flairHandlers } from "../ui";

/** Страница звонка со светлым фоном (прихожая, итоговые экраны) и местом под боковую панель координатора. */
export function CallPage(props: { children: ReactNode; sidePanel?: ReactNode }) {
  return (
    <PanelLayout sidePanel={props.sidePanel}>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 pt-4 pb-10 md:px-8 md:pt-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <img src="/logo.svg" alt="Дети Марии" className="h-9 w-auto md:h-11" />
          <span className="rounded-full bg-surface px-4 py-1.5 text-sm font-medium text-hint">Видеособеседование</span>
        </header>
        {props.children}
      </div>
    </PanelLayout>
  );
}

/**
 * Основная часть + боковая панель координатора (T-69: «План / Итог»).
 * На ноутбуке панель справа на всю высоту, на телефоне — под звонком. Без панели — просто основная часть.
 */
export function PanelLayout(props: { children: ReactNode; sidePanel?: ReactNode }) {
  if (!props.sidePanel) return <>{props.children}</>;
  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 lg:overflow-y-auto">{props.children}</div>
      <aside
        aria-label="Заметки координатора"
        className="border-t border-line bg-surface p-4 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      >
        {props.sidePanel}
      </aside>
    </div>
  );
}

/** Видео. Когда камеры нет — заглушка с текстом, а не чёрный прямоугольник. */
export function Video(props: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  hidden?: boolean;
  /** cover — заполнить рамку (телефон), contain — показать кадр целиком */
  fit?: string;
  /** размер и положение рамки; без absolute — укажите relative (на рамке держится заглушка) */
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== props.stream) ref.current.srcObject = props.stream;
  }, [props.stream]);
  const show = props.stream && !props.hidden;
  return (
    <div className={`overflow-hidden bg-ink ${props.className ?? "relative"}`}>
      {/* видео не убираем из DOM, даже когда камера выключена: в нём идёт и звук собеседника */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={props.muted}
        className={`h-full w-full ${props.fit ?? "object-cover"} ${props.mirrored ? "-scale-x-100" : ""} ${show ? "" : "invisible"}`}
      />
      {!show && props.children}
    </div>
  );
}

/** Заглушка на месте видео: кружок с иконкой и подпись. */
export function VideoPlaceholder(props: { text: string; small?: boolean; pulse?: boolean; children?: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
      <span
        className={`flex items-center justify-center rounded-full bg-white/10 ${props.small ? "size-10" : "size-24 md:size-28"} ${props.pulse ? "call-pulse" : ""}`}
      >
        <Icon name="person" className={props.small ? "size-5" : "size-12"} />
      </span>
      <p className={props.small ? "text-sm leading-tight" : "max-w-[24ch] font-display text-xl text-balance md:text-2xl"}>
        {props.text}
      </p>
      {props.children}
    </div>
  );
}

/** Ряд кнопок «Микрофон», «Камера» (и «Завершить звонок» в звонке) — крупные, с подписями. */
export function Controls(props: {
  mic: boolean;
  cam: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  onMic: () => void;
  onCam: () => void;
  onEnd?: () => void;
}) {
  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      <Toggle
        on={props.mic}
        disabled={!props.hasAudio}
        onClick={props.onMic}
        icon="mic"
        label="Микрофон"
        state={!props.hasAudio ? "нет доступа" : props.mic ? "включён" : "выключен"}
      />
      <Toggle
        on={props.cam}
        disabled={!props.hasVideo}
        onClick={props.onCam}
        icon="cam"
        label="Камера"
        state={!props.hasVideo ? "нет доступа" : props.cam ? "включена" : "выключена"}
      />
      {props.onEnd && (
        <button
          type="button"
          onClick={props.onEnd}
          {...flairHandlers}
          className={`btn-flair ${CONTROL} bg-[var(--logo-red)] text-white [--flair:#9e0f08] [--flair-text:#fff]`}
        >
          <Icon name="hangup" className="size-7" />
          <span className="leading-tight">
            Завершить
            <br />
            звонок
          </span>
        </button>
      )}
    </div>
  );
}

const CONTROL =
  "flex min-h-[4.75rem] w-[6.6rem] flex-col items-center justify-center gap-1 rounded-3xl px-2 py-2 text-[0.85rem] font-semibold sm:w-32 sm:text-base disabled:opacity-60";

function Toggle(props: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: "mic" | "cam";
  label: string;
  state: string;
}) {
  // включено — полупрозрачная кнопка на тёмном фоне; выключено — белая с красной зачёркнутой иконкой
  const look = props.on
    ? "bg-white/15 text-white backdrop-blur [--flair:#fff] [--flair-text:var(--p-ink)]"
    : "bg-white text-ink [--flair:var(--p-soft)] [--flair-text:var(--p-ink)]";
  return (
    <button
      type="button"
      aria-pressed={props.on}
      disabled={props.disabled}
      onClick={props.onClick}
      {...flairHandlers}
      className={`btn-flair ${CONTROL} ${look}`}
    >
      <Icon
        name={props.on ? props.icon : `${props.icon}-off`}
        className={`size-7 ${props.on ? "" : "text-[var(--logo-red)]"}`}
      />
      <span className="leading-tight">
        {props.label}
        <br />
        <span className="font-normal">{props.state}</span>
      </span>
    </button>
  );
}

/** Главная кнопка страницы — фирменная оранжевая, как «Заполнить анкету». */
export function CtaButton(props: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      {...flairHandlers}
      className={`btn-flair min-h-16 w-full rounded-full bg-cta px-8 text-lg font-bold text-white shadow-[0_8px_24px_-8px_var(--p-cta)] disabled:opacity-60 ${FLAIR.cta}`}
    >
      {props.children}
    </button>
  );
}

/**
 * Индикатор микрофона: полоски прыгают, когда человек говорит. Звук никуда не уходит —
 * громкость считается прямо в браузере (Web Audio).
 */
export function MicLevel(props: { stream: MediaStream | null; on: boolean }) {
  const bars = useRef<HTMLSpanElement>(null);
  const track = props.stream?.getAudioTracks()[0];

  useEffect(() => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!track || !props.on || !Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    // Safari считает звук только у узлов, подключённых к выходу, — подключаем через нулевую громкость
    const silent = ctx.createGain();
    silent.gain.value = 0;
    analyser.connect(silent).connect(ctx.destination);
    // браузер может не запустить звук до первого нажатия на странице
    const resume = () => ctx.resume().catch(() => {});
    resume();
    document.addEventListener("pointerdown", resume, { once: true });

    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const lit = Math.round(Math.min(1, Math.sqrt(sum / data.length) * 6) * 5);
      [...(bars.current?.children ?? [])].forEach((bar, i) => bar.classList.toggle("is-lit", i < lit));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", resume);
      ctx.close().catch(() => {});
    };
  }, [track, props.on]);

  const text = !track ? "Микрофона нет" : props.on ? "Микрофон" : "Микрофон выключен";
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ink/70 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
      <Icon name={track && props.on ? "mic" : "mic-off"} className="size-4" />
      {text}
      {track && props.on && (
        <span ref={bars} className="mic-bars" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      )}
    </span>
  );
}

/** Текстовый экран: отменено, ошибка, звонок завершён. Всегда с выходом — кнопкой или ссылкой. */
export function CallMessage(props: { title: string; text?: string; tone?: "error"; children?: ReactNode }) {
  return (
    <section
      role={props.tone === "error" ? "alert" : undefined}
      className="mx-auto mt-4 flex w-full max-w-xl flex-col gap-5 rounded-[2rem] bg-surface p-6 md:mt-12 md:p-10"
    >
      <h1 className="font-display text-2xl leading-tight font-semibold text-balance md:text-3xl">{props.title}</h1>
      {props.text && <p className="text-lg">{props.text}</p>}
      {props.children && <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{props.children}</div>}
    </section>
  );
}

/** Небольшие иконки в одном стиле (контур 2px), чтобы не тянуть библиотеку. */
export function Icon(props: {
  name: "mic" | "mic-off" | "cam" | "cam-off" | "hangup" | "person" | "alert";
  className?: string;
}) {
  const paths = {
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    ),
    "mic-off": (
      <>
        <path d="M15 9.5V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.4 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3" />
        <path d="m4 4 16 16" />
      </>
    ),
    cam: (
      <>
        <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
        <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
      </>
    ),
    "cam-off": (
      <>
        <path d="M10 6h3a2.5 2.5 0 0 1 2.5 2.5v3l6-4.5v10l-1.5-1M15.5 15.5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 5 6" />
        <path d="m3 3 18 18" />
      </>
    ),
    hangup: (
      <path d="M3 14.5c4.9-4.4 13.1-4.4 18 0l-1.8 2.8a1 1 0 0 1-1.2.4l-3.2-1.3a1 1 0 0 1-.6-1l.2-2.2a10 10 0 0 0-4.8 0l.2 2.2a1 1 0 0 1-.6 1L6 17.7a1 1 0 0 1-1.2-.4z" />
    ),
    person: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4M12 17h.01" />
      </>
    ),
  }[props.name];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${props.className ?? "size-6"}`}
    >
      {paths}
    </svg>
  );
}
