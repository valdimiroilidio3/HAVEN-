import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink-900/10 pb-6", className)}>
      <div>
        {eyebrow && <p className="label-micro text-ink-400">{eyebrow}</p>}
        <h1 className="display mt-2 text-[2.3rem] leading-none tracking-tightest sm:text-[2.8rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.82rem] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function AdminCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-md border border-ink-900/10 bg-[#fbfbf8]", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-900/10 px-5 py-4">
          <div>
            {title && <h2 className="text-[0.9rem] font-medium text-obsidian">{title}</h2>}
            {description && <p className="mt-1 max-w-xl text-[0.72rem] leading-relaxed text-ink-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
