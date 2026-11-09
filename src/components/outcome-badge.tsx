const STYLE: Record<string, { label: string; cls: string }> = {
  interview: { label: "Interview", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100" },
  assessment: { label: "Assessment", cls: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100" },
  offer: { label: "Offer", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" },
  rejected: { label: "Not moving forward", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  confirmation: { label: "Received", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  rejection: { label: "Not moving forward", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  job_alert: { label: "Job alert", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100" },
};

export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome || !STYLE[outcome]) return null;
  const s = STYLE[outcome];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
