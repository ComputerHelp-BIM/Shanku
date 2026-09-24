import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Kbd } from '@shanku/ui';
import { GUIDE, searchGuide, type GuideBlock, type GuideSection } from '../lib/guide';

/** **bold** and `code` inside guide text. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>,
  );
}

function Block({ b }: { b: GuideBlock }) {
  if ('p' in b) return <p>{inline(b.p)}</p>;
  if ('note' in b) return <p className="app-guide__note">{inline(b.note)}</p>;
  if ('list' in b)
    return (
      <ul>
        {b.list.map((t, i) => (
          <li key={i}>{inline(t)}</li>
        ))}
      </ul>
    );
  if ('table' in b)
    return (
      <table className="app-guide__table">
        <thead>
          <tr>{b.table.head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {b.table.rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
  if ('faq' in b)
    return (
      <div className="app-guide__faq">
        {b.faq.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{inline(f.a)}</p>
          </details>
        ))}
      </div>
    );
  if ('keys' in b)
    return (
      <table className="app-guide__table">
        <tbody>
          {b.keys.map((k) => (
            <tr key={k.keys + k.action}>
              <td className="app-guide__keys"><Kbd>{k.keys}</Kbd></td>
              <td>{k.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return (
    <div>
      {b.releases.map((r) => (
        <section key={r.version} className="app-guide__release">
          <h3>
            {r.version} <span>{r.date}</span>
          </h3>
          <ul>
            {r.items.map((t) => (
              <li key={t}>{inline(t)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export interface GuidePanelProps {
  /** Section to show first (e.g. 'keys' from the Keyboard button). */
  initial?: string;
}

/** Guide & FAQ (F1): searchable sections in three groups, read without leaving the model. */
export function GuidePanel({ initial }: GuidePanelProps) {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<string>(initial ?? GUIDE[0].id);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initial) setCurrent(initial);
  }, [initial]);
  const hits = useMemo(() => searchGuide(query), [query]);
  // While searching, show every matching section in one scroll; otherwise the chosen one.
  const shown: GuideSection[] = query.trim() ? hits : GUIDE.filter((s) => s.id === current);
  useEffect(() => body.current?.scrollTo({ top: 0 }), [current, query]);
  const groups = ['Guide', 'Answers', 'About'] as const;
  return (
    <div className="app-guide">
      <nav className="app-guide__nav" aria-label="Guide sections">
        <input
          type="search"
          className="app-guide__search"
          placeholder="Search the guide…"
          aria-label="Search the guide"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {groups.map((g) => (
          <div key={g} role="group" aria-label={g}>
            <div className="app-guide__group">{g}</div>
            {GUIDE.filter((s) => s.group === g).map((s) => {
              const dim = query.trim() !== '' && !hits.includes(s);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={['app-guide__link', !query.trim() && s.id === current && 'is-active', dim && 'is-dim'].filter(Boolean).join(' ')}
                  aria-current={!query.trim() && s.id === current ? 'page' : undefined}
                  onClick={() => {
                    setQuery('');
                    setCurrent(s.id);
                  }}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="app-guide__body" ref={body}>
        {shown.length ? (
          shown.map((s) => (
            <article key={s.id} aria-labelledby={`guide-${s.id}`}>
              <h2 id={`guide-${s.id}`}>{s.title}</h2>
              {s.blocks.map((b, i) => (
                <Block key={i} b={b} />
              ))}
            </article>
          ))
        ) : (
          <p className="app-guide__note">Nothing in the guide matches “{query.trim()}”. Try fewer words, or press Ctrl + K to search commands.</p>
        )}
      </div>
    </div>
  );
}
