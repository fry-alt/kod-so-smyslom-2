import { useState } from "react";

import type { VolunteerIn } from "../../api";
import { backend, setVolunteerId, USE_MOCK } from "../../backend";
import { navigate } from "../../router";
import { tgUser } from "../../telegram";
import { Button, ErrorBox, errorText, Todo } from "../../ui";

// Пример анкеты — пока настоящей формы нет, им проверяется путь «анкета → статус».
const SAMPLE: VolunteerIn = {
  name: tgUser?.first_name ?? "Тестовый волонтёр",
  contact: tgUser?.username ? `@${tgUser.username}` : "test@example.com",
  telegram_id: tgUser?.id ?? null,
  answers: {
    about: "Работаю удалённо, люблю керамику и фотографию.",
    skills: "керамика, фотография",
    wishes: "Помогать на занятиях с детьми",
    experience: "Волонтёрила в приюте для животных",
    availability: ["weekday_day", "weekend"],
    occupation: "remote",
    region: "moscow",
    formats: ["offline"],
    regularity: "regular",
  },
};

export default function Form() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendSample() {
    setLoading(true);
    setError("");
    try {
      const v = await backend.submit(SAMPLE);
      setVolunteerId(v.id);
      navigate("/me");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Анкета волонтёра</h1>
      <Todo task="T-07">Пока можно отправить пример анкеты, чтобы пройти путь дальше.</Todo>
      {error && <ErrorBox text={error} />}
      <Button wide loading={loading} onClick={sendSample}>
        Отправить пример анкеты{USE_MOCK ? " (демо)" : ""}
      </Button>
    </div>
  );
}
