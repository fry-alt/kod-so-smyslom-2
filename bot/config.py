from pydantic_settings import BaseSettings, SettingsConfigDict


class BotSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    telegram_bot_token: str = ""
    backend_url: str = "http://localhost:8000"
    webapp_url: str = ""  # https-адрес Mini App; пусто — кнопки Mini App не будет
    backend_timeout: float = 90.0
    log_level: str = "INFO"
