// «Войти». Отдельного входа пока нет: личный кабинет — это анкета, запомненная на устройстве,
// где её заполнили (localStorage, а в Telegram — внутри приложения). Здесь честно объясняем, как попасть в кабинет.
import { navigate } from "../../router";
import { tg } from "../../telegram";
import { Button, Card } from "../../ui";

export default function Login() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold">Вход в личный кабинет</h1>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Впервые у нас?</h2>
        <p>Заполните анкету — после неё сразу откроется личный кабинет: обучение, занятия, ваши часы.</p>
        <Button wide onClick={() => navigate("/form")}>
          Заполнить анкету
        </Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Уже заполняли анкету?</h2>
        <p>
          Кабинет открывается там, где вы заполняли анкету: на том же телефоне или компьютере, в том же браузере.
          Если заполняли в Telegram — откройте приложение из бота фонда.
        </p>
        {!tg?.initData && (
          <a
            href="https://t.me/DetiMarii_bot"
            target="_blank"
            rel="noreferrer"
            className="min-h-12 self-start rounded-full border-2 border-line px-6 py-3 font-semibold hover:border-accent"
          >
            Открыть бота @DetiMarii_bot
          </a>
        )}
        <p className="text-hint">
          Не получается войти — напишите координатору фонда, он поможет: mariaschildren@yandex.ru, +7 495 692-48-70.
        </p>
      </Card>
    </div>
  );
}
