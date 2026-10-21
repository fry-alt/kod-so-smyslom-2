// Простой показ учебного текста в markdown — без библиотек. Понимает только то, что пишет фонд:
// заголовки (#, ##, ###), абзацы, списки «- » и «1. », цитаты «> », **жирный**.
// Строки одного абзаца или пункта списка можно переносить — они склеиваются.
import type { ReactNode } from "react";

type Block =
  | { kind: "h1" | "h2" | "h3" | "p" | "quote"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let last = null as Block | null; // блок, к которому приклеивается следующая строка

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      last = null;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const number = line.match(/^\d+[.)]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);

    if (heading) {
      const kind = (["h1", "h2", "h3"] as const)[heading[1].length - 1];
      blocks.push({ kind, text: heading[2] });
      last = null;
    } else if (bullet || number) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? number)![1];
      if (last?.kind === kind) last.items.push(item);
      else blocks.push((last = { kind, items: [item] }));
    } else if (quote) {
      if (last?.kind === "quote") last.text += " " + quote[1];
      else blocks.push((last = { kind: "quote", text: quote[1] }));
    } else if (last?.kind === "ul" || last?.kind === "ol") {
      last.items[last.items.length - 1] += " " + line; // перенос внутри пункта списка
    } else if (last?.kind === "p") {
      last.text += " " + line;
    } else {
      blocks.push((last = { kind: "p", text: line }));
    }
  }
  return blocks;
}

/** **жирный** → <b>. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={i}>{part.slice(2, -2)}</b> : part,
  );
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-4 text-lg leading-relaxed">
      {parse(text).map((b, i) => {
        switch (b.kind) {
          case "h1":
            return <h2 key={i} className="text-2xl font-bold">{inline(b.text)}</h2>;
          case "h2":
            return <h3 key={i} className="pt-2 text-xl font-bold">{inline(b.text)}</h3>;
          case "h3":
            return <h4 key={i} className="text-lg font-bold">{inline(b.text)}</h4>;
          case "quote":
            return (
              <p key={i} className="border-l-4 border-accent pl-4 text-hint">
                {inline(b.text)}
              </p>
            );
          case "ul":
          case "ol": {
            const List = b.kind;
            return (
              <List key={i} className={`flex flex-col gap-2 pl-6 ${b.kind === "ul" ? "list-disc" : "list-decimal"}`}>
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            );
          }
          default:
            return <p key={i}>{inline(b.text)}</p>;
        }
      })}
    </div>
  );
}
