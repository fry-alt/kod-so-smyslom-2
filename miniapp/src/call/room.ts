// Видеокомната на WebRTC — перенесена из Yapp (public/room.js), оставлено только нужное для
// собеседования: двое, камера и микрофон, переподключение. Сигнальный сервер — backend/app/api/calls.py.
//
// Как устроено: браузеры через WebSocket бэкенда обмениваются описанием соединения (SDP)
// и адресами (ICE-кандидатами), а видео и звук идут напрямую между ними (или через TURN).
// Звонит тот, кто вошёл позже, — поэтому встречных предложений не бывает.
import { callSocketUrl, type CallRole, type IceServer } from "../api";

export type CallStatus = "connecting" | "connected" | "reconnecting" | "closed";
export type PeerState = { mic: boolean; cam: boolean };

export type RoomEvents = {
  status?(state: CallStatus): void;
  /** Собеседник вошёл (state) или вышел (null). */
  presence?(id: CallRole, state: PeerState | null): void;
  /** Пришло видео и звук собеседника. */
  remote?(id: CallRole, stream: MediaStream): void;
  /** Собеседник выключил или включил микрофон и камеру. */
  peerState?(id: CallRole, state: PeerState): void;
  /** Состояние соединения с собеседником: connecting | connected | failed … */
  connection?(id: CallRole, state: RTCPeerConnectionState): void;
  /** Войти нельзя: ссылка отменена, неизвестна или звонок открыт в другой вкладке. */
  fatal?(message: string): void;
};

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type Peer = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[]; stream: MediaStream | null; initiator: boolean; answered: boolean };
type ServerMessage =
  | { type: "joined"; you: CallRole; peers: ({ id: CallRole } & PeerState)[] }
  | ({ type: "peer-joined"; id: CallRole } & PeerState)
  | { type: "peer-left"; id: CallRole }
  | { type: "signal"; from: CallRole; data: Signal }
  | ({ type: "state"; id: CallRole } & PeerState)
  | { type: "replaced" }
  | { type: "error"; message: string };

/** Камера и микрофон. Нет камеры — только звук; нет ничего — stream: null и понятный текст. */
export async function getLocalMedia(): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia)
    return { stream: null, error: "Здесь нет доступа к камере. Откройте ссылку в браузере (Chrome, Safari)." };
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
    });
    return { stream, error: null };
  } catch {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      return { stream, error: "Камера недоступна — вы будете только со звуком." };
    } catch {
      return { stream: null, error: "Нет доступа к микрофону и камере. Разрешите их в настройках браузера." };
    }
  }
}

export class Room {
  private peers = new Map<CallRole, Peer>();
  private early = new Map<CallRole, RTCIceCandidateInit[]>(); // кандидаты, пришедшие раньше предложения
  private ws: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private mic: boolean;
  private cam: boolean;
  private readonly token: string;
  private readonly role: CallRole;
  private readonly iceServers: IceServer[];
  private readonly local: MediaStream | null;
  private readonly on: RoomEvents;

  constructor(opts: { token: string; role: CallRole; iceServers: IceServer[]; local: MediaStream | null; on: RoomEvents }) {
    this.token = opts.token;
    this.role = opts.role;
    this.iceServers = opts.iceServers;
    this.local = opts.local;
    this.on = opts.on;
    // микрофон и камеру могли выключить ещё до входа
    this.mic = !!this.local?.getAudioTracks().some((t) => t.enabled);
    this.cam = !!this.local?.getVideoTracks().some((t) => t.enabled);
  }

  start() {
    this.connect();
  }

  private connect() {
    if (this.stopped) return;
    this.on.status?.(this.retry ? "reconnecting" : "connecting");
    const ws = new WebSocket(callSocketUrl(this.token));
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.send({ type: "join", role: this.role, mic: this.mic, cam: this.cam });
    };
    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handle(msg).catch((err) => console.error("room", err));
    };
    ws.onclose = () => {
      if (this.stopped || this.ws !== ws) return;
      this.closeAllPeers();
      this.on.status?.("reconnecting");
      const delay = Math.min(1000 * 2 ** this.retry++, 10_000);
      setTimeout(() => this.connect(), delay);
    };
  }

  private send(obj: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private async handle(msg: ServerMessage) {
    switch (msg.type) {
      case "joined":
        this.on.status?.("connected");
        for (const p of msg.peers) {
          this.on.presence?.(p.id, { mic: p.mic, cam: p.cam });
          this.call(p.id);
        }
        break;
      case "peer-joined":
        // собеседник мог переподключиться — старое соединение с ним больше не нужно
        this.closePeer(msg.id);
        this.on.presence?.(msg.id, { mic: msg.mic, cam: msg.cam });
        break;
      case "peer-left":
        this.closePeer(msg.id);
        this.on.presence?.(msg.id, null);
        break;
      case "signal":
        await this.onSignal(msg.from, msg.data);
        break;
      case "state":
        this.on.peerState?.(msg.id, { mic: msg.mic, cam: msg.cam });
        break;
      case "replaced":
        this.stop({ keepMedia: true });
        this.on.fatal?.("Звонок открыт в другой вкладке или на другом устройстве — здесь он остановлен.");
        break;
      case "error":
        this.stop({ keepMedia: true });
        this.on.fatal?.(msg.message);
        break;
    }
  }

  private createPeer(id: CallRole): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers as RTCIceServer[] });
    const peer: Peer = { pc, pending: this.early.get(id) ?? [], stream: null, initiator: false, answered: false };
    this.early.delete(id);
    this.peers.set(id, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ type: "signal", to: id, data: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      if (e.streams[0]) peer.stream = e.streams[0];
      else {
        peer.stream ??= new MediaStream();
        peer.stream.addTrack(e.track);
      }
      this.on.remote?.(id, peer.stream);
    };
    pc.onconnectionstatechange = () => {
      this.on.connection?.(id, pc.connectionState);
      if (pc.connectionState === "failed" && peer.initiator) pc.restartIce();
    };
    return peer;
  }

  private call(id: CallRole) {
    const peer = this.createPeer(id);
    peer.initiator = true;
    const { pc } = peer;
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription();
        this.send({ type: "signal", to: id, data: { sdp: pc.localDescription } });
      } catch (err) {
        console.error("offer", err);
      }
    };
    const kinds = new Set<string>();
    if (this.local) {
      for (const track of this.local.getTracks()) {
        pc.addTrack(track, this.local);
        kinds.add(track.kind);
      }
    }
    // даже без своей камеры хотим видеть и слышать собеседника
    for (const kind of ["audio", "video"]) if (!kinds.has(kind)) pc.addTransceiver(kind, { direction: "recvonly" });
  }

  private async onSignal(from: CallRole, data: Signal) {
    let peer = this.peers.get(from);
    if (data?.sdp) {
      if (data.sdp.type === "offer") {
        if (!peer || peer.initiator) {
          this.closePeer(from);
          peer = this.createPeer(from);
        }
        await peer.pc.setRemoteDescription(data.sdp);
        if (!peer.answered && this.local) {
          for (const track of this.local.getTracks()) peer.pc.addTrack(track, this.local);
        }
        peer.answered = true;
        await peer.pc.setLocalDescription();
        this.send({ type: "signal", to: from, data: { sdp: peer.pc.localDescription } });
      } else if (data.sdp.type === "answer") {
        if (!peer || peer.pc.signalingState !== "have-local-offer") return;
        await peer.pc.setRemoteDescription(data.sdp);
      }
      if (!peer) return;
      for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
    } else if (data?.candidate) {
      if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      else if (peer) peer.pending.push(data.candidate);
      else {
        if (!this.early.has(from)) this.early.set(from, []);
        this.early.get(from)!.push(data.candidate);
      }
    }
  }

  setMic(on: boolean) {
    this.mic = on;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.send({ type: "state", mic: this.mic, cam: this.cam });
  }

  setCam(on: boolean) {
    this.cam = on;
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.send({ type: "state", mic: this.mic, cam: this.cam });
  }

  private closePeer(id: CallRole) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onnegotiationneeded = null;
    peer.pc.close();
    this.peers.delete(id);
  }

  private closeAllPeers() {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
  }

  stop({ keepMedia = false } = {}) {
    if (!this.stopped) {
      this.stopped = true;
      this.send({ type: "leave" });
      this.ws?.close();
      this.closeAllPeers();
      this.on.status?.("closed");
    }
    if (!keepMedia) this.local?.getTracks().forEach((t) => t.stop());
  }
}
