import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  contentKey: string;
  fallbackTitle?: string;
  fallbackBody?: string;
  children?: ReactNode;
};

/**
 * Fetch a `site_content` row by key on the client and render it as Markdown.
 * Falls back to `fallbackTitle` / `fallbackBody` (or children) when the row
 * is empty — so pages never look blank, but the CEO can override
 * every institutional text from `/admin/contenus`.
 */
export function CmsSection({ contentKey, fallbackTitle, fallbackBody, children }: Props) {
  const [title, setTitle] = useState<string | null>(fallbackTitle ?? null);
  const [body, setBody] = useState<string | null>(fallbackBody ?? null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("site_content")
      .select("title, body")
      .eq("key", contentKey)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (data) {
          if (data.title) setTitle(data.title);
          if (data.body) setBody(data.body);
        }
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [contentKey]);

  if (!loaded && !fallbackBody && !children) return null;
  if (!body && !children) return null;

  return (
    <div className="prose prose-slate max-w-none text-navy-deep/85">
      {title && <h2 className="font-display text-2xl font-bold text-navy-deep gold-underline">{title}</h2>}
      {body ? <div className="mt-6"><SimpleMarkdown source={body} /></div> : children}
    </div>
  );
}

/** Minimal safe markdown renderer: headings, bold, italic, links, lists, paragraphs. */
function SimpleMarkdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: string[] | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="mt-4 leading-relaxed">
          <Inline text={para.join(" ")} />
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="mt-3 list-disc space-y-1 pl-5">
          {list.map((it, i) => (
            <li key={i}><Inline text={it} /></li>
          ))}
        </ul>,
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      const text = h[2];
      const cls = level === 1
        ? "mt-6 font-display text-2xl font-bold text-navy-deep"
        : level === 2
        ? "mt-6 font-display text-xl font-bold text-navy-deep"
        : "mt-4 font-display text-lg font-semibold text-navy-deep";
      blocks.push(<div key={`h-${blocks.length}`} className={cls}><Inline text={text} /></div>);
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      list = list ?? [];
      list.push(li[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return <>{blocks}</>;
}

function Inline({ text }: { text: string }) {
  // very small: bold, italic, link
  const parts: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={idx++}>{m[2]}</strong>);
    else if (m[4]) parts.push(<em key={idx++}>{m[4]}</em>);
    else if (m[5]) parts.push(<a key={idx++} href={m[6]} className="text-navy underline hover:text-gold">{m[5]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
