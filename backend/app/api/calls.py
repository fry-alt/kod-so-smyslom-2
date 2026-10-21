"""Звонок видеособеседования: настройки для страницы и сигнальный сервер WebRTC.

Перенесено из Yapp (server/signaling.js). Браузеры обмениваются через этот WebSocket
описаниями соединения (SDP) и адресами (ICE-кандидатами), а видео и звук идут напрямую
между ними или через TURN. Через бэкенд видео не проходит и нигде не сохраняется.

В комнате два места: координатор и волонтёр. Тот же участник зашёл ещё раз (обновил
страницу, вторая вкладка) — старое подключение закрываем, новое занимает его место.

Протокол — JSON-сообщения:
  клиент → сервер: join {role, mic, cam}, signal {to, data}, state {mic, cam}, leave
  сервер → клиент: joined {you, peers}, peer-joined {id, mic, cam}, peer-left {id},
                   signal {from, data}, state {id, mic, cam}, replaced, error {message}
id участника — его роль: coordinator | volunteer.
"""

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass
from typing import Any, get_args

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlmodel import Session

from app.config import get_settings
from app.db import get_engine, get_session
from app.models import Interview
from app.schemas import CallInfo, CallRole
from app.services import interviews

log = logging.getLogger(__name__)

router = APIRouter(prefix="/calls", tags=["calls"])

JOIN_TIMEOUT = 10  # секунд ждём первое сообщение join


@dataclass
class Peer:
    ws: WebSocket
    mic: bool
    cam: bool


# token → {роль: участник}. Живёт в памяти одного процесса бэкенда — его хватает с запасом.
rooms: dict[str, dict[str, Peer]] = {}


def call_error(interview: Interview | None) -> str | None:
    """Почему в звонок нельзя войти — текст для человека, или None."""
    if interview is None:
        return "Ссылка на звонок недействительна. Попросите координатора прислать новую."
    if interview.status == "canceled":
        return "Это собеседование отменено. Координатор свяжется с вами."
    if interview.status == "done":
        return "Это собеседование уже прошло."
    return None


def _interview_or_404(session: Session, token: str) -> Interview:
    interview = interviews.by_token(session, token)
    if interview is None:
        raise HTTPException(404, call_error(None))
    return interview


@router.get("/{token}", response_model=CallInfo)
def info(token: str, session: Session = Depends(get_session)) -> CallInfo:
    """Время, статус и серверы STUN/TURN для страницы звонка."""
    interview = _interview_or_404(session, token)
    return CallInfo(
        starts_at=interview.starts_at,
        status=interview.status,
        ice_servers=interviews.ice_servers(get_settings()),
    )


async def _send(ws: WebSocket, message: dict[str, Any]) -> None:
    # участник уже отключился — его уберёт его собственный обработчик
    with contextlib.suppress(WebSocketDisconnect, RuntimeError):
        await ws.send_json(message)


async def _broadcast(room: dict[str, Peer], message: dict[str, Any], except_role: str) -> None:
    for role, peer in list(room.items()):
        if role != except_role:
            await _send(peer.ws, message)


async def _receive(ws: WebSocket) -> dict[str, Any] | None:
    """Следующее сообщение-словарь; мусор пропускаем."""
    while True:
        try:
            message = json.loads(await ws.receive_text())
        except json.JSONDecodeError:
            continue
        if isinstance(message, dict):
            return message


@router.websocket("/{token}/ws")
async def signaling(ws: WebSocket, token: str) -> None:
    await ws.accept()
    with Session(get_engine()) as session:
        error = call_error(interviews.by_token(session, token))
    if error:
        await _send(ws, {"type": "error", "message": error})
        await ws.close()
        return

    try:
        join = await asyncio.wait_for(_receive(ws), JOIN_TIMEOUT)
    except (TimeoutError, WebSocketDisconnect):
        await ws.close()
        return
    role = join.get("role")
    if join.get("type") != "join" or role not in get_args(CallRole):
        await _send(ws, {"type": "error", "message": "Неизвестный участник звонка"})
        await ws.close()
        return

    room = rooms.setdefault(token, {})
    previous = room.get(role)
    if previous is not None:
        await _send(previous.ws, {"type": "replaced"})
        with contextlib.suppress(RuntimeError):  # уже закрыт
            await previous.ws.close()
    me = Peer(ws, mic=join.get("mic") is not False, cam=join.get("cam") is not False)
    room[role] = me
    others = [{"id": r, "mic": p.mic, "cam": p.cam} for r, p in room.items() if r != role]
    await _send(ws, {"type": "joined", "you": role, "peers": others})
    await _broadcast(room, {"type": "peer-joined", "id": role, "mic": me.mic, "cam": me.cam}, role)
    log.info("Звонок %s…: вошёл %s, в комнате %s", token[:4], role, len(room))

    try:
        while True:
            message = await _receive(ws)
            kind = message.get("type")
            if kind == "signal":
                target = room.get(str(message.get("to")))
                if target is not None and target is not me:
                    await _send(
                        target.ws, {"type": "signal", "from": role, "data": message.get("data")}
                    )
            elif kind == "state":
                me.mic, me.cam = bool(message.get("mic")), bool(message.get("cam"))
                await _broadcast(
                    room, {"type": "state", "id": role, "mic": me.mic, "cam": me.cam}, role
                )
            elif kind == "leave":
                break
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        # место могло уже перейти к новому подключению того же участника — тогда его не трогаем
        if room.get(role) is me:
            del room[role]
            await _broadcast(room, {"type": "peer-left", "id": role}, role)
            log.info("Звонок %s…: вышел %s, в комнате %s", token[:4], role, len(room))
        if not room and rooms.get(token) is room:
            del rooms[token]
        with contextlib.suppress(RuntimeError):  # уже закрыт
            await ws.close()
