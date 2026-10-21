"""Волонтёрские часы: выгрузка CSV для «Добро.рф» и благодарность от фонда (T-16).

Роли и мероприятия — по участиям со статусом attended. Часы — поле hours волонтёра
(растёт, когда координатор отмечает «участвовал»; можно поправить вручную в карточке).
В LLM уходят только часы, названия ролей и мероприятий. Имя подставляем после.
"""

import csv
import io
import logging

from sqlmodel import Session, col, select

from app.llm.client import get_llm
from app.llm.prompts import load_prompt
from app.llm.providers import LLMError
from app.models import Opportunity, Participation, Volunteer
from app.schemas import Thanks
from app.services import volunteers
from app.services.roles import load_roles

log = logging.getLogger(__name__)

CSV_COLUMNS = ["Имя", "Контакт", "Часы", "Роли", "Статус"]
# как в miniapp/src/labels.ts
STATUS = {
    "new": "Новая анкета",
    "training": "Проходит обучение",
    "trained": "Обучение пройдено",
    "approved": "Допущен",
    "active": "Активен",
    "paused": "На паузе",
}
SIGNATURE = "Фонд «Дети Марии»"


def attended(session: Session, volunteer: Volunteer) -> list[Opportunity]:
    """Возможности, где волонтёр участвовал, — по порядку."""
    query = (
        select(Opportunity)
        .join(Participation, col(Participation.opportunity_id) == col(Opportunity.id))
        .where(Participation.volunteer_id == volunteer.id, Participation.status == "attended")
        .order_by(col(Opportunity.starts_at))
    )
    return list(session.exec(query).all())


def role_titles(opportunities: list[Opportunity]) -> list[str]:
    titles = {r.code: r.title for r in load_roles()}
    codes = [o.role_code for o in opportunities if o.role_code in titles]
    return [titles[c] for c in dict.fromkeys(codes)]


def export_csv(session: Session) -> str:
    """CSV для Excel: UTF-8 с BOM и «;» — так русский Excel сам открывает кириллицу по столбцам."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(CSV_COLUMNS)
    rows = sorted(volunteers.list_all(session), key=lambda v: v.hours, reverse=True)
    for v in rows:
        roles = ", ".join(role_titles(attended(session, v)))
        writer.writerow(
            [
                excel_text(v.name),
                excel_text(v.contact),
                hours_text(v.hours),
                roles,
                STATUS[v.status],
            ]
        )
    return "﻿" + buffer.getvalue()


def excel_text(value: str) -> str:
    """Excel принимает «+7 900…» и «=…» за формулу. Апостроф в начале — значит «это текст»."""
    return "'" + value if value[:1] in ("=", "+", "-", "@") else value


def hours_text(hours: float) -> str:
    """4 → «4», 4.5 → «4,5» — дробная запятая, как ждёт русский Excel."""
    return f"{hours:g}".replace(".", ",")


def thanks(session: Session, volunteer: Volunteer) -> Thanks:
    events = attended(session, volunteer)
    roles = role_titles(events)
    body = None
    if get_llm().provider.name != "fake":  # заглушка fake пишет «[fake] …» — такое не отправишь
        try:
            prompt = load_prompt(
                "thanks",
                hours=hours_text(volunteer.hours),
                roles=", ".join(roles) or "—",
                events=", ".join(e.title for e in events) or "—",
            )
            body = get_llm().chat(prompt, system=load_prompt("system")).strip() or None
        except LLMError as e:
            log.warning("Благодарность без AI: %s", e)
    ai = body is not None
    body = body or template_body(volunteer.hours, roles)
    return Thanks(text=f"{volunteer.name}, здравствуйте!\n\n{body}\n\n{SIGNATURE}", ai=ai)


def template_body(hours: float, roles: list[str]) -> str:
    """Благодарность без LLM: тот же смысл, простыми словами."""
    parts = []
    if hours:
        parts.append(f"Спасибо вам за {hours_text(hours)} ч. волонтёрской помощи фонду!")
    else:
        parts.append("Спасибо, что вы с фондом!")
    if roles:
        parts.append(f"Вы помогали как {', '.join(r.lower() for r in roles)}.")
    parts.append(
        "Для наших подопечных это очень важно: каждый, кто приходит, помогает им "
        "почувствовать себя нужными. Будем рады видеть вас снова."
    )
    return " ".join(parts)
