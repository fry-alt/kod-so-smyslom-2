import { getVolunteerId } from "../../backend";
import { navigate } from "../../router";
import { tgUser } from "../../telegram";
import { Button, Card } from "../../ui";

export default function Welcome() {
  const volunteerId = getVolunteerId();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold leading-tight">
        {tgUser ? `${tgUser.first_name}, здравствуйте!` : "Здравствуйте!"}
      </h1>
      <Card>
        <p>
          Фонд «Дети Марии» больше 30 лет помогает детям-сиротам, выпускникам детских домов и людям с
          ментальными особенностями. В наших мастерских — керамика, живопись, валяние и кулинария.
        </p>
        <p className="mt-3">Расскажите о себе — мы подберём, где ваша помощь нужнее всего.</p>
      </Card>
      {volunteerId ? (
        <Button wide onClick={() => navigate("/me")}>
          Мой статус и задачи
        </Button>
      ) : (
        <Button wide onClick={() => navigate("/form")}>
          Стать волонтёром
        </Button>
      )}
      <Button wide variant="secondary" onClick={() => navigate("/ask")}>
        Спросить о фонде
      </Button>
    </div>
  );
}
