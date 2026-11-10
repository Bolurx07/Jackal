// Shared building blocks so every page uses the same spacing, borders, type and colours.
import Link from "next/link";
import type { ReactNode } from "react";

/** Page container: same width and padding on every page. */
export const pageClass = "mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8";

export const cx =(...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

/** Button hierarchy: primary (main action), secondary, ghost (low emphasis), danger (destructive). */
export function buttonClass(variant: Variant = "secondary", size: Size = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-60",
    size === "md" ? "h-9 px-4 text-sm" : "h-8 px-3 text-[13px]",
    variant === "primary" && "bg-primary text-white hover:bg-primary-hover",
    variant === "secondary" && "border border-line bg-surface text-foreground hover:bg-subtle",
    variant === "ghost" && "text-muted hover:bg-subtle hover:text-foreground",
    variant === "danger" && "border border-line bg-surface text-danger hover:border-danger hover:bg-danger-soft",
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted transition-colors hover:border-line-strong focus:border-primary";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  tone,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: "warning" | "success" | "primary";
}) {
  return (
    <section
      className={cx(
        "rounded-xl border bg-surface p-5",
        tone === "warning" ? "border-warning/40" : tone === "success" ? "border-success/40" : tone === "primary" ? "border-primary/40" : "border-line",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-muted",
  primary: "bg-primary-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>
      {children}
    </span>
  );
}

/** Match score. Colour only marks strong matches, so it stays meaningful. */
export function Score({ value }: { value: number }) {
  return (
    <span
      title="Match score (0–100)"
      className={cx(
        "inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1.5 text-[13px] font-semibold tabular-nums",
        value >= 85 ? "bg-success-soft text-success" : value >= 70 ? "bg-primary-soft text-accent" : "bg-subtle text-muted",
      )}
    >
      {value}
    </span>
  );
}

const APP_STATUS: Record<string, { label: string; tone: Tone }> = {
  awaiting_approval: { label: "Awaiting review", tone: "warning" },
  approved: { label: "Approved", tone: "primary" },
  submitted: { label: "Submitted", tone: "success" },
  rejected: { label: "Rejected by you", tone: "neutral" },
};

export function AppStatusBadge({ status }: { status: string }) {
  const s = APP_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  shortlisted: { label: "Shortlisted", tone: "primary" },
  pending_score: { label: "New", tone: "neutral" },
  not_recommended: { label: "Not recommended", tone: "neutral" },
  filtered_out: { label: "Filtered out", tone: "neutral" },
  duplicate: { label: "Duplicate", tone: "neutral" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const s = JOB_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Segmented tabs (links). Scrolls sideways on small screens instead of wrapping. */
export function Tabs({ items }: { items: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Filter">
      <div className="inline-flex gap-1 rounded-lg border border-line bg-surface p-1">
        {items.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              t.active ? "bg-primary-soft text-accent" : "text-muted hover:bg-subtle hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cx("tabular-nums", t.active ? "text-accent" : "text-muted")}>{t.count}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted">{children}</p>;
}

export const Dot = () => <span aria-hidden>·</span>;

/** "3h ago", "yesterday", or a date. */
export function timeAgo(d: Date | null | undefined, now = new Date()): string {
  if (!d) return "";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 0) {
    const m = Math.round(-s / 60);
    if (m < 60) return `in ${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `in ${h}h` : `in ${Math.round(h / 24)}d`;
  }
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
