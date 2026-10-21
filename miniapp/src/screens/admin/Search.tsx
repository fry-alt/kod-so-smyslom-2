import { useState, type FormEvent } from "react";

import type { SearchResponse } from "../../api";
import { backend } from "../../backend";
import { STATUS, STATUS_COLOR } from "../../labels";
import { Badge, Button, Card, Empty, ErrorBox, errorText, inputClass, Link, Loading, Todo } from "../../ui";

const EXAMPLES = ["Фотограф на четверг утром, разово", "Кто умеет керамику в будни днём", "Психолог по утрам"];

export default function Search() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(q: string) {
    if (!q.trim()) return;
    setQuery(q);
    setLoading(true);
    setError("");
    try {
      setResult(await backend.search({ query: q }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Кого ищем?</h1>
      <Todo task="T-08">Здесь только проверка, что поиск отвечает: чипсы, фильтры и карточки — там.</Todo>
      <form
        className="flex gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          run(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Например: фотограф на четверг утром"
          className={inputClass}
        />
        <Button type="submit" loading={loading}>
          Найти
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((q) => (
          <Button key={q} variant="secondary" onClick={() => run(q)}>
            {q}
          </Button>
        ))}
      </div>
      {loading && <Loading text="Ищем подходящих волонтёров…" />}
      {error && <ErrorBox text={error} onRetry={() => run(query)} />}
      {result && !loading && result.candidates.length === 0 && (
        <Empty>Никого не нашли. Попробуйте описать задачу другими словами.</Empty>
      )}
      {result && !loading && (
        <div className="grid gap-3 md:grid-cols-2">
          {result.candidates.map((c) => (
            <Card key={c.volunteer.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/admin/volunteers/${c.volunteer.id}`} className="text-lg font-semibold text-link">
                  {c.volunteer.name}
                </Link>
                <span className="text-2xl font-bold">{c.score}</span>
              </div>
              <div>
                <Badge className={STATUS_COLOR[c.volunteer.status]}>{STATUS[c.volunteer.status]}</Badge>
              </div>
              <p className="text-hint">{c.reason}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
