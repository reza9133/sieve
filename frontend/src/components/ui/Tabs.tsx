import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
  badge?: ReactNode;
}

export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, index: number) => {
    const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = (index + move + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    const target = tabs[next];
    if (target) onChange(target.id);
  };
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div>
      <div role="tablist" aria-label="Tender sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {tabs.map((tab, i) => {
          const selected = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`${base}-t-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-p-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${selected ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}
            >
              {tab.label}
              {tab.badge}
            </button>
          );
        })}
      </div>
      {current && (
        <div role="tabpanel" id={`${base}-p-${current.id}`} aria-labelledby={`${base}-t-${current.id}`} className="pt-6">
          {current.content}
        </div>
      )}
    </div>
  );
}
