import { useState, type FormEvent } from "react";

import { api, type AskResponse, type ChatMessage } from "./api";
import { tg, tgUser } from "./telegram";

type Tab = "docs" | "chat";

export default function App() {
  const [tab, setTab] = useState<Tab>("docs");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">Помощник НКО</h1>
        <p className="text-sm text-tg-hint">
          {tgUser ? `Здравствуйте, ${tgUser.first_name}!` : "Открыто вне Telegram — режим гостя"}
        </p>
      </header>

      <nav className="grid grid-cols-2 gap-1 rounded-xl bg-tg-secondary p-1 text-sm">
        <TabButton active={tab === "docs"} onClick={() => setTab("docs")}>
          📚 По документам
        </TabButton>
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
          💬 Чат
        </TabButton>
      </nav>

      {tab === "docs" ? <AskPanel /> : <ChatPanel />}
    </main>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-lg py-2 ${props.active ? "bg-tg-bg font-medium shadow-sm" : "text-tg-hint"}`}
    >
      {props.children}
    </button>
  );
}

function AskPanel() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    try {
      setResult(await api.ask(question));
      tg?.HapticFeedback?.impactOccurred("light");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input value={question} onChange={setQuestion} placeholder="Как стать волонтёром?" />
        <SubmitButton loading={loading}>Спросить</SubmitButton>
      </form>
      {error && <ErrorBox text={error} />}
      {result && (
        <article className="flex flex-col gap-3 rounded-xl bg-tg-secondary p-4">
          <p className={result.found ? "" : "text-tg-hint"}>{result.answer}</p>
          {result.sources.map((s) => (
            <details key={`${s.source}:${s.chunk}`} className="text-sm">
              <summary className="cursor-pointer text-tg-link">
                📄 {s.source} · фрагмент {s.chunk} · {s.score.toFixed(2)}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-tg-hint">{s.text}</p>
            </details>
          ))}
        </article>
      )}
    </section>
  );
}

function ChatPanel() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    setLoading(true);
    setError("");
    try {
      const { answer } = await api.chat(text, history);
      setHistory([...history, { role: "user", content: text }, { role: "assistant", content: answer }]);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-3">
      <div className="flex flex-1 flex-col gap-2">
        {history.length === 0 && <p className="text-sm text-tg-hint">Напишите первое сообщение.</p>}
        {history.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
              m.role === "user"
                ? "self-end bg-tg-button text-tg-button-text"
                : "self-start bg-tg-secondary"
            }`}
          >
            {m.content}
          </div>
        ))}
      </div>
      {error && <ErrorBox text={error} />}
      <form onSubmit={submit} className="sticky bottom-0 flex gap-2 bg-tg-bg py-2">
        <Input value={message} onChange={setMessage} placeholder="Сообщение" />
        <SubmitButton loading={loading}>➤</SubmitButton>
      </form>
    </section>
  );
}

function Input(props: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      className="min-w-0 flex-1 rounded-xl bg-tg-secondary px-3 py-2 outline-none placeholder:text-tg-hint"
    />
  );
}

function SubmitButton(props: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={props.loading}
      className="rounded-xl bg-tg-button px-4 py-2 font-medium text-tg-button-text disabled:opacity-50"
    >
      {props.loading ? "…" : props.children}
    </button>
  );
}

function ErrorBox({ text }: { text: string }) {
  return <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800">⚠️ {text}</p>;
}
