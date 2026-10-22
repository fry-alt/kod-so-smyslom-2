// «Настройки» кабинета фонда: код фонда, без которого нельзя зарегистрироваться координатором.
// Данные — GET/PUT /auth/fund-code (только для координатора). Пока код не меняли — 1111.
import { useEffect, useState, type FormEvent } from "react";

import { auth } from "../../backend";
import { Button, ErrorBox, errorText, Field, inputClass, Loading, PageTitle, useLoad } from "../../ui";
import { Panel } from "./parts";

export default function Settings() {
  const { data, error, loading, reload } = useLoad(() => auth.fundCode());
  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Настройки</PageTitle>
        <p className="mt-1 text-lg text-hint">Кто может попасть в кабинет фонда.</p>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox text={`Не удалось загрузить настройки: ${error}`} onRetry={reload} />}
      {data && <FundCodeForm current={data.code} />}
    </div>
  );
}

function FundCodeForm(props: { current: string }) {
  const [current, setCurrent] = useState(props.current);
  const [code, setCode] = useState(props.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => setSaved(false), [code]);

  const clean = code.trim();
  const invalid = clean.length < 4 || /\s/.test(clean) ? "Код — от 4 символов, без пробелов" : "";

  async function save(e: FormEvent) {
    e.preventDefault();
    if (invalid) return setError(invalid);
    setSaving(true);
    setError("");
    try {
      const out = await auth.setFundCode({ code: clean });
      setCurrent(out.code);
      setCode(out.code);
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Код фонда"
      dot="bg-accent"
      hint="Без этого кода нельзя зарегистрироваться координатором. Сообщайте его только сотрудникам фонда."
    >
      <form onSubmit={save} className="flex max-w-md flex-col gap-4">
        <p className="rounded-2xl bg-page px-4 py-3">
          Сейчас: <span className="font-display text-2xl font-semibold tracking-wider">{current}</span>
        </p>
        <Field label="Новый код" hint="От 4 символов, без пробелов. Уже зарегистрированные координаторы продолжат входить как раньше.">
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" className={inputClass} />
        </Field>
        {error && <ErrorBox text={error} />}
        {saved && <p className="font-semibold text-green-700">Сохранено. Новым координаторам нужен код {current}.</p>}
        <div>
          <Button type="submit" loading={saving} disabled={clean === current}>
            Сохранить код
          </Button>
        </div>
      </form>
    </Panel>
  );
}
