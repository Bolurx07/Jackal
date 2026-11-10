import { Badge } from "./ui";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

const STYLE: Record<string, { label: string; tone: Tone }> = {
  interview: { label: "Interview", tone: "primary" },
  assessment: { label: "Assessment", tone: "primary" },
  offer: { label: "Offer", tone: "success" },
  rejected: { label: "Not moving forward", tone: "neutral" },
  rejection: { label: "Not moving forward", tone: "neutral" },
  confirmation: { label: "Received", tone: "neutral" },
  job_alert: { label: "Job alert", tone: "neutral" },
};

/** Outcome of an application, or the kind of a recognised email. */
export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome || !STYLE[outcome]) return null;
  const s = STYLE[outcome];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
