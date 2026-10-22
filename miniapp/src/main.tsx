import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { backend, getVolunteerId, setVolunteerId } from "./backend";
import "./index.css";
import { initTelegram, tg } from "./telegram";

initTelegram();

/** Mini App, а анкета на этом телефоне не запомнена (другое устройство, Telegram очистил память):
 *  спрашиваем бэкенд по подписи Telegram. Ждём не дольше 3 секунд — без ответа открываемся как обычно. */
async function findTelegramVolunteer() {
  if (!tg?.initData || getVolunteerId()) return;
  const found = backend
    .byTelegram()
    .then((v) => setVolunteerId(v.id))
    .catch(() => {}); // анкеты ещё нет — человек её заполнит
  await Promise.race([found, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

findTelegramVolunteer().then(() => {
  // Mini App из бота открывается на «/»: кто уже заполнил анкету — сразу в кабинет.
  // Логотип внутри приложения по-прежнему ведёт на лендинг.
  if (tg?.initData && location.pathname === "/" && getVolunteerId()) history.replaceState(null, "", "/me");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
