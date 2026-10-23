import type { ReactNode } from 'react';

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page pb-8 pt-12 sm:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-4xl font-bold sm:text-5xl">{title}</h1>
          {lead && <div className="mt-4 max-w-[62ch] text-lg leading-8 text-muted">{lead}</div>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function Section({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="page py-8">
      {title && <h2 className="mb-5 text-2xl font-semibold sm:text-3xl">{title}</h2>}
      {children}
    </section>
  );
}
