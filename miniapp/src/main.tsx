import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { getVolunteerId } from "./backend";
import "./index.css";
import { initTelegram, tg } from "./telegram";

initTelegram();

// Mini App из бота открывается на «/»: кто уже заполнил анкету — сразу в кабинет.
// Логотип внутри приложения по-прежнему ведёт на лендинг.
if (tg?.initData && location.pathname === "/" && getVolunteerId()) history.replaceState(null, "", "/me");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
