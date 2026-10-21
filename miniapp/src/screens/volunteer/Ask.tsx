// «Спросить о фонде»: вопросы по документам фонда (RAG) и чат — перенесено из демо шаблона.
// Доработка — в задаче T-18.
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { AskResponse, ChatMessage } from "../../api";
import { chatApi } from "../../backend";
import { tg } from "../../telegram";
import { Button, ErrorBox, errorText, inputClass } from "../../ui";

type Tab = "docs" | "chat";

export default function Ask() {
  const [tab, setTab] = useState<Tab>("docs");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Спросить о фонде</h1>
      <nav className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
        <TabButton active={tab === "docs"} onClick={() => setTab("docs")}>
          📚 По документам
        </TabButton>
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
          💬 Чат
        </TabButton>
      </nav>
      {tab === "docs" ? <AskPanel /> : <ChatPanel />}
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`min-h-12 rounded-xl ${props.active ? "bg-page font-semibold shadow-sm" : "text-hint"}`}
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
      setResult(await chatApi.ask(question));
      tg?.HapticFeedback?.impactOccurred("light");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <GrowingTextarea value={question} onChange={setQuestion} placeholder="Как стать волонтёром?" />
        <Button type="submit" loading={loading} wide>
          Спросить
        </Button>
      </form>
      {error && <ErrorBox text={error} />}
      {result && (
        <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <p className={result.found ? "" : "text-hint"}>{result.answer}</p>
          {result.sources.map((s) => (
            <details key={`${s.source}:${s.chunk}`} className="text-sm">
              <summary className="cursor-pointer text-link">
                📄 {s.source} · фрагмент {s.chunk}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-hint">{s.text}</p>
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
      const { answer } = await chatApi.chat(text, history);
      setHistory([...history, { role: "user", content: text }, { role: "assistant", content: answer }]);
    } catch (err) {
      setError(errorText(err));
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {history.length === 0 && <p className="text-hint">Напишите первое сообщение.</p>}
        {history.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 ${
              m.role === "user" ? "self-end bg-accent text-accent-text" : "self-start bg-surface"
            }`}
          >
            {m.content}
          </div>
        ))}
      </div>
      {error && <ErrorBox text={error} />}
      <form onSubmit={submit} className="sticky bottom-0 flex items-end gap-2 bg-page py-2">
        <GrowingTextarea value={message} onChange={setMessage} placeholder="Сообщение" />
        <Button type="submit" loading={loading}>
          ➤
        </Button>
      </form>
    </section>
  );
}

/** Поле, которое растёт вниз по мере набора (до ~6 строк, дальше — прокрутка).
 *  Enter — отправить, Shift+Enter — новая строка. */
function GrowingTextarea(props: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [props.value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={props.placeholder}
      className={`${inputClass} resize-none leading-normal`}
    />
  );
}

const MAX_TEXTAREA_HEIGHT = 200; // px ≈ 6 строк
