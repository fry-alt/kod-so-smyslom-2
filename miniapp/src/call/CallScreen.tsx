// Видеособеседование: /call/<token> — волонтёр, /call/<token>?as=coordinator — координатор.
// Сначала «прихожая»: проверить камеру и микрофон, потом «Войти в звонок».
// Оформление (видео, кнопки, индикатор микрофона, раскладка) — в parts.tsx, WebRTC — в room.ts.
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { CallInfo, CallRole } from "../api";
import { backend, USE_MOCK } from "../backend";
import { useSearchParam } from "../router";
import { initData, tg } from "../telegram";
import { Button, Link, Loading, formatWhen, useLoad } from "../ui";
import { getLocalMedia, Room, type CallStatus, type PeerState } from "./room";
import {
  CallMessage,
  CallPage,
  Controls,
  CtaButton,
  Icon,
  MicLevel,
  PanelLayout,
  Video,
  VideoPlaceholder,
} from "./parts";

/** Собеседник в родительном падеже: «Ждём координатора…» */
const OTHER: Record<CallRole, string> = { coordinator: "волонтёра", volunteer: "координатора" };
/** …и в творительном: «Соединяемся с координатором…» */
const WITH_OTHER: Record<CallRole, string> = { coordinator: "волонтёром", volunteer: "координатором" };
/** Куда уйти со страницы звонка. */
const HOME: Record<CallRole, { to: string; text: string }> = {
  coordinator: { to: "/admin", text: "В кабинет фонда" },
  volunteer: { to: "/", text: "На главную" },
};

/** Боковая панель координатора: получает ended — «звонок завершён», чтобы сразу открыть итог. */
type SidePanel = (ended: boolean) => ReactNode;

/**
 * sidePanel — боковая панель координатора (T-69: «План / Итог», call/CoordinatorPanel.tsx). Показывается только
 * с ?as=coordinator: на ноутбуке справа, на телефоне под звонком.
 */
export default function CallScreen(props: { token: string; sidePanel?: SidePanel }) {
  const role: CallRole = useSearchParam("as") === "coordinator" ? "coordinator" : "volunteer";
  const info = useLoad(() => backend.callInfo(props.token), [props.token]);
  const sidePanel = role === "coordinator" ? props.sidePanel : undefined;

  if (info.data) return <Call token={props.token} role={role} info={info.data} sidePanel={sidePanel} />;
  return (
    <CallPage sidePanel={sidePanel?.(false)}>
      {info.loading && <Loading text="Открываем звонок…" />}
      {/* неверная ссылка — текст с бэкенда: «Ссылка на звонок недействительна…» */}
      {info.error && (
        <CallMessage title="Не получается открыть звонок" text={info.error} tone="error">
          <Button onClick={info.reload}>Попробовать ещё раз</Button>
          <HomeLink role={role} />
        </CallMessage>
      )}
    </CallPage>
  );
}

function Call(props: { token: string; role: CallRole; info: CallInfo; sidePanel?: SidePanel }) {
  const { info, role } = props;
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [joined, setJoined] = useState(false);
  const [ended, setEnded] = useState(false);
  const [attempt, setAttempt] = useState(0); // «Попробовать ещё раз» — снова спросить камеру
  const [round, setRound] = useState(0); // «Переподключиться» — заново войти в комнату
  const sidePanel = props.sidePanel?.(ended);

  // камера включается сразу в «прихожей» — человек видит себя и понимает, что всё работает;
  // при уходе со страницы камера и микрофон выключаются
  useEffect(() => {
    if (info.status !== "scheduled") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setMediaReady(false);
    getLocalMedia().then((r) => {
      stream = r.stream;
      if (cancelled) return stream?.getTracks().forEach((t) => t.stop());
      setLocal(r.stream);
      setMediaError(r.error);
      setMic(!!r.stream?.getAudioTracks().length);
      setCam(!!r.stream?.getVideoTracks().length);
      setMediaReady(true);
    });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [info.status, attempt]);

  const page = (children: ReactNode) => <CallPage sidePanel={sidePanel}>{children}</CallPage>;

  if (info.status === "canceled")
    return page(
      <CallMessage
        title="Собеседование отменено"
        text={
          role === "volunteer"
            ? "Координатор свяжется с вами и предложит другое время."
            : "Назначьте новое время в карточке волонтёра."
        }
      >
        <HomeLink role={role} />
      </CallMessage>,
    );
  if (info.status === "done")
    return page(
      <CallMessage title="Это собеседование уже прошло" text={role === "volunteer" ? "Спасибо!" : undefined}>
        <HomeLink role={role} />
      </CallMessage>,
    );

  if (ended)
    return page(
      <CallMessage
        title="Звонок завершён"
        text={
          role === "volunteer"
            ? "Спасибо, что пришли на собеседование! Координатор напишет вам о следующих шагах."
            : sidePanel
              ? "Запишите итог в панели «Итог», пока всё свежо в памяти. Он сохранится в карточке волонтёра."
              : "Не забудьте отметить собеседование в карточке волонтёра и оставить заметку."
        }
      >
        {role === "volunteer" ? (
          <Link to="/me" className={LINK_BUTTON}>
            Мой статус
          </Link>
        ) : (
          <HomeLink role={role} />
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setEnded(false);
            setJoined(false);
            setAttempt((a) => a + 1);
          }}
        >
          Вернуться в звонок
        </Button>
      </CallMessage>,
    );

  if (joined)
    return (
      <InCall
        key={round}
        token={props.token}
        role={role}
        info={info}
        local={local}
        mic={mic}
        cam={cam}
        setMic={setMic}
        setCam={setCam}
        onEnd={() => setEnded(true)}
        onRejoin={() => setRound((r) => r + 1)}
        sidePanel={sidePanel}
      />
    );

  return page(
    <Lobby
      role={role}
      info={info}
      local={local}
      mediaReady={mediaReady}
      mediaError={mediaError}
      mic={mic}
      cam={cam}
      setMic={setMic}
      setCam={setCam}
      onRetryMedia={() => setAttempt((a) => a + 1)}
      onJoin={() => setJoined(true)}
    />,
  );
}

const LINK_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-full border-2 border-line bg-page px-6 py-3 font-semibold text-ink hover:border-accent";

function HomeLink(props: { role: CallRole }) {
  const home = HOME[props.role];
  return (
    <Link to={home.to} className={LINK_BUTTON}>
      {home.text}
    </Link>
  );
}

/** «Прихожая»: своё видео, индикатор микрофона, «Войти в звонок». */
function Lobby(props: {
  role: CallRole;
  info: CallInfo;
  local: MediaStream | null;
  mediaReady: boolean;
  mediaError: string | null;
  mic: boolean;
  cam: boolean;
  setMic: (on: boolean) => void;
  setCam: (on: boolean) => void;
  onRetryMedia: () => void;
  onJoin: () => void;
}) {
  const { local, role } = props;
  const hasAudio = !!local?.getAudioTracks().length;
  const hasVideo = !!local?.getVideoTracks().length;
  const toggle = (kind: "audio" | "video", on: boolean) =>
    local?.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = on));

  const join = !props.mediaReady
    ? "Включаем камеру…"
    : hasVideo
      ? "Войти в звонок"
      : hasAudio
        ? "Войти только со звуком"
        : "Войти без камеры и микрофона";

  return (
    <main className="grid gap-6 md:grid-cols-[1.35fr_1fr] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-6">
      <div className="flex flex-col gap-3 md:col-start-2 md:self-end">
        <p className="font-medium text-accent">{role === "coordinator" ? "Вы — координатор" : "Фонд «Дети Марии»"}</p>
        <h1 className="font-display text-[1.6rem] leading-[1.15] font-semibold tracking-tight text-balance md:text-[2rem] xl:text-[2.4rem]">
          Собеседование с {role === "coordinator" ? "волонтёром" : "координатором"}
        </h1>
        <p className="text-xl font-semibold">{formatWhen(props.info.starts_at)}</p>
      </div>

      <div className="flex flex-col gap-3 md:col-start-1 md:row-span-2 md:row-start-1 md:self-center">
        <Video
          stream={local}
          muted
          mirrored
          hidden={!props.cam}
          className="relative aspect-[4/3] w-full rounded-[2rem] md:aspect-video"
        >
          <VideoPlaceholder
            text={!props.mediaReady ? "Включаем камеру…" : hasVideo ? "Камера выключена" : "Камера недоступна"}
          />
        </Video>
        <div className="call-stage flex flex-wrap items-center justify-center gap-3 rounded-[2rem] bg-ink p-3 sm:justify-between">
          <MicLevel stream={local} on={props.mic} />
          <Controls
            mic={props.mic}
            cam={props.cam}
            hasAudio={hasAudio}
            hasVideo={hasVideo}
            onMic={() => (toggle("audio", !props.mic), props.setMic(!props.mic))}
            onCam={() => (toggle("video", !props.cam), props.setCam(!props.cam))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 md:col-start-2 md:self-start">
        <p className="text-lg text-hint">
          Проверьте, что вас видно и слышно: скажите что-нибудь — полоски у микрофона должны двигаться.
        </p>
        {props.mediaError && <MediaProblem text={props.mediaError} hasAudio={hasAudio} onRetry={props.onRetryMedia} />}
        {USE_MOCK && <p className="text-hint">Демо-режим: сам звонок работает только с настоящим бэкендом.</p>}
        <CtaButton disabled={!props.mediaReady} onClick={props.onJoin}>
          {join}
        </CtaButton>
        <p className="text-hint">
          Если {OTHER[role]} ещё нет — подождите на этой странице, звонок начнётся сам.
        </p>
      </div>
    </main>
  );
}

/** Нет камеры или микрофона: что сделать, и всё равно можно войти. В Telegram на iPhone — «Открыть в браузере». */
function MediaProblem(props: { text: string; hasAudio: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-3xl bg-pop/20 p-4">
      <p className="flex gap-2 font-semibold">
        <Icon name="alert" className="mt-0.5 size-6 text-pop-2" />
        {props.text}
      </p>
      <p>
        Разрешите {props.hasAudio ? "камеру" : "камеру и микрофон"} в настройках браузера (значок замка или камеры
        рядом с адресом страницы) и нажмите «Попробовать ещё раз». Можно войти и так —{" "}
        {props.hasAudio ? "только со звуком" : "вы будете видеть и слышать собеседника"}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={props.onRetry}>
          Попробовать ещё раз
        </Button>
        {initData && tg?.openLink && (
          <Button variant="secondary" onClick={() => tg?.openLink?.(location.href)}>
            Открыть в браузере
          </Button>
        )}
      </div>
    </div>
  );
}

function InCall(props: {
  token: string;
  role: CallRole;
  info: CallInfo;
  local: MediaStream | null;
  mic: boolean;
  cam: boolean;
  setMic: (on: boolean) => void;
  setCam: (on: boolean) => void;
  onEnd: () => void;
  onRejoin: () => void;
  sidePanel?: ReactNode;
}) {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [peer, setPeer] = useState<PeerState | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [link, setLink] = useState<RTCPeerConnectionState | null>(null);
  const [fatal, setFatal] = useState("");
  const { onEnd, role, sidePanel } = props;

  useEffect(() => {
    const room = new Room({
      token: props.token,
      role: props.role,
      iceServers: props.info.ice_servers,
      local: props.local,
      on: {
        status: setStatus,
        presence: (_, state) => {
          setPeer(state);
          if (!state) {
            setRemote(null);
            setLink(null);
          }
        },
        remote: (_, stream) => setRemote(stream),
        peerState: (_, state) => setPeer(state),
        connection: (_, state) => setLink(state),
        fatal: setFatal,
      },
    });
    roomRef.current = room;
    room.start();
    return () => room.stop({ keepMedia: true }); // камеру выключает «Завершить» или уход со страницы
  }, []); // комната создаётся один раз на вход

  // соединение может «зависнуть» без ошибки (строгая сеть) — через 20 секунд предлагаем переподключиться
  const [slow, setSlow] = useState(false);
  const present = !!peer;
  useEffect(() => {
    setSlow(false);
    if (!present || link === "connected") return;
    const timer = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(timer);
  }, [present, link]);

  function end() {
    roomRef.current?.stop();
    onEnd();
  }

  if (fatal)
    return (
      <CallPage sidePanel={sidePanel}>
        {/* текст с бэкенда: звонок отменён, открыт в другой вкладке и т. п. */}
        <CallMessage title="Звонок остановлен" text={fatal} tone="error">
          <Button onClick={props.onRejoin}>Войти снова</Button>
          <HomeLink role={role} />
        </CallMessage>
      </CallPage>
    );

  const failed = !!peer && (link === "failed" || slow);
  const hint =
    status === "reconnecting" || link === "disconnected"
      ? "Связь прервалась — переподключаемся…"
      : status === "connecting"
        ? "Подключаемся…"
        : !peer
          ? `Ждём ${OTHER[role]}…`
          : failed
            ? "Не получается соединиться. Попробуйте другую сеть — например, мобильный интернет."
            : link !== "connected"
              ? `Соединяемся с ${WITH_OTHER[role]}…`
              : null;
  const who = role === "coordinator" ? "Волонтёр" : "Координатор";

  return (
    <PanelLayout sidePanel={sidePanel}>
      <section
        aria-label="Видеозвонок"
        className={`call-stage relative flex flex-col overflow-hidden bg-ink text-white ${sidePanel ? "h-[78dvh] lg:h-dvh" : "h-dvh"}`}
      >
        {/* собеседник — на весь экран; пока его нет — понятный текст на месте видео */}
        <Video stream={peer ? remote : null} hidden={!peer?.cam || !!hint} fit="object-cover md:object-contain" className="absolute inset-0">
          <VideoPlaceholder text={hint ?? `Камера ${OTHER[role]} выключена`} pulse={!peer && status === "connected"}>
            {!peer && status === "connected" && (
              <p className="max-w-[32ch] text-balance text-white/75">Не закрывайте страницу — звонок начнётся сам.</p>
            )}
            {failed && (
              <button
                type="button"
                onClick={props.onRejoin}
                className="mt-1 min-h-12 rounded-full bg-white px-6 font-semibold text-ink"
              >
                Переподключиться
              </button>
            )}
          </VideoPlaceholder>
        </Video>
        {/* для экранных дикторов: состояние звонка читается вслух при изменении */}
        <p role="status" className="sr-only">
          {hint ?? `${who} в звонке`}
        </p>

        <div className="relative flex flex-wrap items-start justify-between gap-2 p-3 md:p-5">
          <span className="rounded-full bg-white px-3 py-1.5">
            <img src="/logo.svg" alt="Дети Марии" className="h-6 w-auto md:h-7" />
          </span>
          {peer && (
            <span className="inline-flex items-center gap-2 rounded-full bg-ink/70 px-3 py-1.5 text-sm font-medium backdrop-blur md:text-base">
              {!peer.mic && <Icon name="mic-off" className="size-4 text-[var(--logo-red)]" />}
              {who}
              {!peer.mic && " без звука"}
            </span>
          )}
        </div>

        {/* своё видео — маленьким окном в углу */}
        <Video
          stream={props.local}
          muted
          mirrored
          hidden={!props.cam}
          className="absolute top-16 right-3 aspect-[3/4] w-[28%] max-w-40 rounded-2xl shadow-lg ring-2 ring-white/40 md:top-auto md:right-5 md:bottom-32 md:aspect-video md:w-56 md:max-w-none"
        >
          <VideoPlaceholder small text="Вы" />
        </Video>

        <div className="relative mt-auto bg-gradient-to-t from-ink/90 to-transparent px-3 pt-10 pb-4 md:pb-6">
          <Controls
            mic={props.mic}
            cam={props.cam}
            hasAudio={!!props.local?.getAudioTracks().length}
            hasVideo={!!props.local?.getVideoTracks().length}
            onMic={() => {
              roomRef.current?.setMic(!props.mic);
              props.setMic(!props.mic);
            }}
            onCam={() => {
              roomRef.current?.setCam(!props.cam);
              props.setCam(!props.cam);
            }}
            onEnd={end}
          />
        </div>
      </section>
    </PanelLayout>
  );
}
