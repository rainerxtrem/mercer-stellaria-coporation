import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return (
    <section className="gov-gradient text-white">
      <div className="container-page py-16 md:py-20">
        {eyebrow && (
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-gold">{eyebrow}</div>
        )}
        <h1 className="font-display text-3xl font-bold md:text-5xl">{title}</h1>
        {description && <p className="mt-4 max-w-3xl text-white/80 md:text-lg">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
