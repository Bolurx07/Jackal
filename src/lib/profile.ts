import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * The fact bank: the single source of truth about your background.
 * Every CV Jackal produces must be built only from items in here.
 * Each bullet has an id so tailored CVs can cite where a claim came from.
 */
const Bullet = z.object({
  id: z.string(),
  text: z.string(),
  tags: z.array(z.string()).default([]),
});

const Experience = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().optional(),
  start: z.string().optional(), // omit when the CV gives no dates
  end: z.string().optional(), // omit = present
  bullets: z.array(Bullet),
});

const Project = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  stack: z.array(z.string()).default([]),
  bullets: z.array(Bullet),
});

/** A role-specific CV = which fact-bank items it uses, in which order. */
const CvVariant = z.object({
  id: z.string(), // e.g. "frontend"
  label: z.string(), // e.g. "Frontend Developer CV"
  headline: z.string(),
  summary: z.string(),
  /** Relevant years for this kind of role (used to judge seniority). */
  yearsOfExperience: z.number().default(0),
  /** A job title containing any of these (case-insensitive) is this CV's kind of role. */
  titleKeywords: z.array(z.string()).default([]),
  /** Which basics.links to show on this CV (e.g. [linkedin]). Omit = all. */
  links: z.array(z.string()).optional(),
  skills: z.array(z.string()),
  experienceIds: z.array(z.string()),
  projectIds: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  basics: z.object({
    name: z.string(),
    /** Used for "First name" / "Last name" form fields. */
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string(),
    phone: z.string().optional(),
    location: z.string(),
    links: z.record(z.string(), z.string()).default({}),
    yearsOfExperience: z.number().optional(),
    workAuthorization: z.string().optional(),
    /** Languages you can work in. Jobs that need other languages are marked ineligible. */
    languages: z.array(z.string()).default(["English"]),
  }),
  skills: z.array(z.string()),
  experience: z.array(Experience),
  projects: z.array(Project).default([]),
  education: z
    .array(z.object({ institution: z.string(), qualification: z.string(), year: z.string().optional() }))
    .default([]),
  certifications: z.array(z.string()).default([]),
  cvs: z.array(CvVariant).min(1),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const PROFILE_PATH = path.join(process.cwd(), "data", "profile", "profile.yaml");

/** Returns null when no profile has been created yet (scoring is then skipped). */
export function loadProfile(): Profile | null {
  if (!existsSync(PROFILE_PATH)) return null;
  return ProfileSchema.parse(parse(readFileSync(PROFILE_PATH, "utf8")));
}

/** Compact text version of the profile for the LLM, grouped by CV variant. */
export function profileForPrompt(profile: Profile): string {
  const exp = new Map(profile.experience.map((e) => [e.id, e]));
  const proj = new Map(profile.projects.map((x) => [x.id, x]));
  const lines: string[] = [
    `Candidate location: ${profile.basics.location}`,
    `Working languages: ${profile.basics.languages.join(", ")}`,
    profile.basics.yearsOfExperience != null
      ? `Years of experience: ${profile.basics.yearsOfExperience}`
      : "",
    profile.basics.workAuthorization ? `Work authorization: ${profile.basics.workAuthorization}` : "",
    `All verified skills: ${profile.skills.join(", ")}`,
    profile.certifications.length ? `Certifications: ${profile.certifications.join(", ")}` : "",
    "",
    "EXPERIENCE",
    ...profile.experience.flatMap((e) => [
      `- ${e.title} at ${e.company} (${e.start ? `${e.start} – ${e.end ?? "present"}` : "dates not given"})`,
      ...e.bullets.map((b) => `    • ${b.text}`),
    ]),
    "",
    "PROJECTS",
    ...profile.projects.flatMap((x) => [
      `- ${x.name} [${x.stack.join(", ")}]`,
      ...x.bullets.map((b) => `    • ${b.text}`),
    ]),
    "",
    "CV LIBRARY (choose best_cv_id from these ids)",
    ...profile.cvs.map(
      (c) =>
        `- id="${c.id}" ${c.label}: ${c.headline}. ~${c.yearsOfExperience} yrs relevant. Skills: ${c.skills.join(", ")}. Uses: ${[
          ...c.experienceIds.map((i) => exp.get(i)?.title ?? i),
          ...c.projectIds.map((i) => proj.get(i)?.name ?? i),
        ].join("; ")}`,
    ),
  ];
  return lines.filter((l) => l !== "").join("\n");
}
