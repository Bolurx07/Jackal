// Shared types for the Jackal pipeline.

export type Workplace = "remote" | "hybrid" | "onsite" | "unknown";

export type SourceName =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "remotive"
  | "himalayas"
  | "linkedin_alert"
  | "indeed_alert"
  | "jobberman_alert";

/** A job listing after normalization, regardless of where it came from. */
export interface NormalizedJob {
  source: SourceName;
  externalId: string;
  company: string;
  title: string;
  url: string;
  location: string;
  workplace: Workplace;
  description: string; // plain text
  postedAt: Date | null;
}

export type FilterResult =
  | { pass: true }
  | { pass: false; reason: string };
