// Видеособеседование: /call/<token> — волонтёр, /call/<token>?as=coordinator — координатор.
// Сначала «прихожая»: проверить камеру и микрофон, потом «Войти в звонок».
import { useEffect, useRef, useState } from "react";

import type { CallInfo, CallRole } from "../api";
import { backend, USE_MOCK } from "../backend";
import { useSearchParam } from "../router";
import { initData, tg } from "../telegram";
import { Button, ErrorBox, Link, Loading, formatWhen, useLoad } from "../ui";
import { getLocalMedia, Room, type CallStatus, type PeerState } from "./room";

const OTHER: Record<CallRole, string> = { coordinator: "волонтёра", volunteer: "координатора" };

export default function CallScreen(props: { token: string }) {
  const role: CallRole = useSearchParam("as") === "coordinator" ? "coordinator" : "volunteer";
  const info = useLoad(() => backend.callInfo(props.token), [props.token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 pt-4 pb-10">
      <header className="font-bold">🧡 Дети Марии · видеособеседование</header>
      {info.loading && <Loading />}
      {info.error && <ErrorBox text={info.error} onRetry={info.reload} />}
      {info.data && <Call token={props.token} role={role} info={info.data} />}
    </div>
  );
}

function Call(props: { token: string; role: CallRole; info: CallInfo }) {
  const { info, role } = props;
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [joined, setJoined] = useState(false);
  const [ended, setEnded] = useState(false);

  // камера включается сразу в «прихожей» — человек видит себя и понимает, что всё работает
  useEffect(() => {
    if (info.status !== "scheduled") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
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
  }, [info.status]);

  if (info.status === "canceled") return <Notice>Это собеседование отменено. Координатор свяжется с вами.</Notice>;
  if (info.status === "done") return <Notice>Это собеседование уже прошло. Спасибо!</Notice>;
  if (ended) return <Ended role={role} />;

  if (joined)
    return (
      <InCall
        token={props.token}
        role={role}
        info={info}
        local={local}
        mic={mic}
        cam={cam}
        setMic={setMic}
        setCam={setCam}
        onEnd={() => setEnded(true)}
      />
    );

  const toggle = (kind: "audio" | "video", on: boolean) =>
    local?.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = on));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Собеседование {formatWhen(info.starts_at)}</h1>
      <p className="text-hint">
        Проверьте, что вас видно и слышно, и нажмите «Войти в звонок». Если {OTHER[role]} ещё нет — подождите
        немного на этой странице.
      </p>
      <Video stream={local} muted mirrored placeholder={mediaReady ? "Камера выключена" : "Включаем камеру…"} />
      {mediaError && <MediaProblem text={mediaError} />}
      {USE_MOCK && <p className="text-hint">Демо-режим: сам звонок работает только с настоящим бэкендом.</p>}
      <Controls
        mic={mic}
        cam={cam}
        hasAudio={!!local?.getAudioTracks().length}
        hasVideo={!!local?.getVideoTracks().length}
        onMic={() => (toggle("audio", !mic), setMic(!mic))}
        onCam={() => (toggle("video", !cam), setCam(!cam))}
      />
      <Button wide disabled={!mediaReady} onClick={() => setJoined(true)}>
        Войти в звонок
      </Button>
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
}) {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [peer, setPeer] = useState<PeerState | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [link, setLink] = useState<RTCPeerConnectionState | null>(null);
  const [fatal, setFatal] = useState("");
  const { onEnd } = props;

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

  // ушли со страницы — выключаем камеру и микрофон
  useEffect(() => () => props.local?.getTracks().forEach((t) => t.stop()), [props.local]);

  function end() {
    roomRef.current?.stop();
    onEnd();
  }

  if (fatal) return <Notice>{fatal}</Notice>;

  const waiting = `Ждём ${OTHER[props.role]}…`;
  const hint =
    status === "reconnecting"
      ? "Связь прервалась — переподключаемся…"
      : status === "connecting"
        ? "Подключаемся…"
        : !peer
          ? waiting
          : link === "failed"
            ? "Не получается соединиться. Попробуйте другую сеть (например, мобильный интернет)."
            : link !== "connected"
              ? "Соединяемся с собеседником…"
              : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Video stream={peer ? remote : null} placeholder={hint ?? "Камера собеседника выключена"} hidden={!peer?.cam} />
        {peer && !peer.mic && (
          <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white">🔇 без звука</span>
        )}
        <div className="absolute right-3 bottom-3 w-1/4 min-w-24 overflow-hidden rounded-xl shadow-lg ring-2 ring-white/50">
          <Video stream={props.local} muted mirrored small placeholder="Вы" hidden={!props.cam} />
        </div>
      </div>
      {hint && peer && <p className="text-center text-hint">{hint}</p>}
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
      />
      <button
        type="button"
        onClick={end}
        className="min-h-12 w-full rounded-2xl bg-red-600 px-5 py-3 font-semibold text-white active:scale-[.98]"
      >
        Завершить звонок
      </button>
    </div>
  );
}

function Video(props: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  small?: boolean;
  hidden?: boolean;
  placeholder: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== props.stream) ref.current.srcObject = props.stream;
  }, [props.stream]);
  const show = props.stream && !props.hidden;
  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-neutral-800 ${props.small ? "" : "rounded-2xl"}`}>
      {/* видео не убираем из DOM, даже когда камера выключена: в нём идёт и звук собеседника */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={props.muted}
        className={`h-full w-full object-cover ${props.mirrored ? "-scale-x-100" : ""} ${show ? "" : "invisible"}`}
      />
      {!show && (
        <p
          className={`absolute inset-0 flex items-center justify-center p-2 text-center text-white/80 ${props.small ? "text-sm" : "text-lg"}`}
        >
          {props.placeholder}
        </p>
      )}
    </div>
  );
}

function Controls(props: {
  mic: boolean;
  cam: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  onMic: () => void;
  onCam: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button variant="secondary" disabled={!props.hasAudio} onClick={props.onMic}>
        {props.mic ? "🎙 Микрофон включён" : "🔇 Микрофон выключен"}
      </Button>
      <Button variant="secondary" disabled={!props.hasVideo} onClick={props.onCam}>
        {props.cam ? "📷 Камера включена" : "🚫 Камера выключена"}
      </Button>
    </div>
  );
}

/** Нет камеры или микрофона. В Telegram на iPhone камеры часто нет — предлагаем открыть в браузере. */
function MediaProblem(props: { text: string }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-amber-100 p-4 text-amber-900">
      <p>⚠️ {props.text}</p>
      {initData && tg?.openLink && (
        <div>
          <Button variant="secondary" onClick={() => tg?.openLink?.(location.href)}>
            Открыть в браузере
          </Button>
        </div>
      )}
    </div>
  );
}

function Notice(props: { children: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xl">{props.children}</p>
      <Link to="/">На главную</Link>
    </div>
  );
}

function Ended(props: { role: CallRole }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold">Звонок завершён</h1>
      {props.role === "volunteer" ? (
        <>
          <p>Спасибо, что пришли на собеседование! Координатор напишет вам о следующих шагах.</p>
          <Link to="/me">Мой статус</Link>
        </>
      ) : (
        <p>Не забудьте отметить собеседование в карточке волонтёра и оставить заметку. Эту вкладку можно закрыть.</p>
      )}
    </div>
  );
}
