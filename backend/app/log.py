"""Единый формат логов для бэкенда, бота и скриптов."""

import logging

LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(level=level.upper(), format=LOG_FORMAT, datefmt="%H:%M:%S", force=True)
    # uvicorn ставит свои обработчики — переводим его логи (включая access) на общий формат
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True
    # шумные библиотеки — только предупреждения
    for name in ("httpx", "httpcore", "chromadb", "openai", "anthropic"):
        logging.getLogger(name).setLevel(logging.WARNING)
