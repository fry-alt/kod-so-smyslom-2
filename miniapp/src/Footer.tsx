// Подвал сайта волонтёра — контакты, реквизиты и документы фонда, как на mariaschildren.ru.
// Все данные и адреса — с сайта фонда (футер страницы «О нас»); меняются здесь.
import type { ReactNode } from "react";

const FUND = "https://mariaschildren.ru/";

/** Документы фонда. Ссылка на «Пользовательское соглашение» в футере сайта фонда отдаёт 404 —
 *  поэтому ведём на страницу «Документы и реквизиты», где лежат все документы. */
export const FUND_DOCS = {
  privacy: `${FUND}uploads/archive/uploads/archive/${encodeURIComponent("Политика_в_отношении_обработки_ПД_23.06.25.pdf")}`,
  terms: `${FUND}o-nas/dokumentyi-i-rekvizityi/`,
};

const NAV = [
  { title: "О фонде", href: "o-nas/missiya/" },
  { title: "Программы", href: "programs/" },
  { title: "Афиша", href: "afisha/" },
  { title: "Контакты", href: "kontakty/" },
  { title: "Помочь", href: "pomoch-nam/" },
  { title: "Реквизиты", href: "o-nas/dokumentyi-i-rekvizityi/" },
];

const REQUISITES = [
  "Учётный № Минюста 7714016557",
  "НКО Москвы 22-0697/22-0159",
  "СОНКО с 13.03.2023 г.",
  "РКН 77-25-190720",
  "ОГРН 1207700187815",
  "ИНН 7707440295",
];

/** Внешняя ссылка: открывается в новой вкладке (в Telegram — во встроенном браузере). */
function Ext(props: { href: string; children: ReactNode; className?: string; label?: string }) {
  return (
    <a href={props.href} target="_blank" rel="noreferrer" aria-label={props.label} className={props.className ?? "hover:text-accent"}>
      {props.children}
    </a>
  );
}

const SOCIALS = [
  {
    label: "Telegram фонда",
    href: "https://t.me/mariaschildren",
    icon: <path d="M21 4.5 2.9 11.4c-.9.4-.9 1.6.1 1.9l4.6 1.4 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.4 4.6 3.4c.6.4 1.4.1 1.6-.6L22.4 5.8c.2-.9-.6-1.6-1.4-1.3ZM9.8 14.3l-.5 3.6-1.3-4.1 9.4-6.1-7.6 6.6Z" />,
  },
  {
    label: "ВКонтакте фонда",
    href: "https://vk.com/mariaschildren",
    icon: <path d="M13.2 18c-6 0-9.5-4.1-9.6-11h3c.1 5 2.3 7.2 4.1 7.6V7h2.8v4.3c1.7-.2 3.6-2.2 4.2-4.3h2.8c-.5 2.7-2.4 4.6-3.8 5.4 1.4.6 3.6 2.4 4.4 5.6h-3.1c-.7-2.1-2.3-3.7-4.5-3.9V18h-.3Z" />,
  },
  {
    label: "TikTok фонда",
    href: "https://www.tiktok.com/@marias.children",
    icon: <path d="M16.6 3c.4 2.2 1.8 3.7 4 3.9v3c-1.5 0-2.9-.4-4-1.2v6.1c0 3.4-2.6 5.7-5.7 5.7a5.6 5.6 0 0 1-1-11.2v3.1a2.6 2.6 0 1 0 1.8 2.5V3h2.9Z" />,
  },
];

export default function Footer() {
  return (
    <footer className="mt-auto flex flex-col gap-8 rounded-[2rem] bg-surface p-6 text-ink md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <img src="/logo.svg" alt="Дети Марии" className="h-9 w-auto md:h-11" />
        <div className="flex gap-3">
          {SOCIALS.map((s) => (
            <Ext key={s.href} href={s.href} label={s.label} className="flex size-12 items-center justify-center rounded-2xl bg-page text-[#1f4bb8] transition hover:-translate-y-0.5">
              <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                {s.icon}
              </svg>
            </Ext>
          ))}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-2">
          <Ext href="tel:+74956924870" className="font-display text-2xl font-semibold hover:text-accent">
            +7 495 692-48-70
          </Ext>
          <Ext href="mailto:mariaschildren@yandex.ru" className="text-link hover:underline">
            mariaschildren@yandex.ru
          </Ext>
          <p className="text-hint">Москва, Дмитровский переулок 4, стр. 1</p>
          <ul className="mt-2 flex flex-col gap-0.5 text-sm text-hint">
            {REQUISITES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-6">
          <nav className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-5" aria-label="Сайт фонда">
            {NAV.map((n) => (
              <Ext key={n.href} href={FUND + n.href}>
                {n.title}
              </Ext>
            ))}
          </nav>
          <p className="max-w-[70ch] text-hint">
            Мы помогаем детям и взрослым из социальных учреждений, таких как центры содействия семейному воспитанию и
            социальные дома (ранее их называли детские дома и интернаты). Свяжитесь с нами, чтобы обсудить
            сотрудничество или поддержку.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
            <Ext href={FUND_DOCS.privacy} className="underline underline-offset-4 hover:text-accent">
              Политика обработки персональных данных
            </Ext>
            <Ext href={FUND_DOCS.terms} className="underline underline-offset-4 hover:text-accent">
              Пользовательское соглашение
            </Ext>
          </div>
        </div>
      </div>

      <p className="text-sm text-hint">
        Информация на сайте предназначена для аудитории 0+. © 1997–{new Date().getFullYear()} БФ «Дети Марии»
      </p>
    </footer>
  );
}
