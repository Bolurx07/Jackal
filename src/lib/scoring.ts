import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Job } from "@/db/schema";
import { profileForPrompt, type Profile } from "./profile";

export const SCORING_MODEL = process.env.JACKAL_MODEL || "claude-opus-5-5";

export const ScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  recommended: z.boolean(),
  best_cv_id: z.string(),
  role_category: z.string(),
  matched_skills: z.array(z.string()),
  missing_must_haves: z.array(z.string()),
  seniority_fit: z.enum(["under", "match", "over", "unclear"]),
  eligibility_concerns: z.array(z.string()),
  reasoning: z.string(),
});
export type ScoreResult = z.infer<typeof ScoreSchema>;

// Kept byte-stable so the system prompt + profile prefix can be cached across jobs.
const SYSTEM = `You are Jackal, a personal job-search agent working for one candidate.
Your task here is evaluation only: judge how well one job fits the candidate.

Rules:
- The candidate profile is the only source of truth. Never assume skills, years or credentials that are not in it.
- Separate mandatory requirements from preferred ones. A missing mandatory requirement weighs much more than a missing preferred one.
- Judge real fit, not keyword overlap: seniority, scope, domain and the actual work.
- Eligibility: the candidate lives in Nigeria. Jobs abroad must be genuinely remote and open to someone in Nigeria. Flag any requirement for local residency, citizenship, security clearance, specific work authorization, or timezone overlap that would be hard from West Africa (WAT, UTC+1).
- best_cv_id must be one of the ids in the CV library.
- recommended = true only if the candidate could credibly get an interview and is eligible.
- Score guide: 85-100 strong fit; 70-84 good fit with small gaps; 50-69 stretch; below 50 poor fit or ineligible.
- reasoning: 2-4 plain sentences on why the job is or isn't recommended.`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export async function scoreJob(job: Job, profile: Profile): Promise<ScoreResult> {
  const response = await getClient().beta.messages.parse({
    model: SCORING_MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: betaZodOutputFormat(ScoreSchema),
    },
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        text: `CANDIDATE PROFILE\n${profileForPrompt(profile)}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Evaluate this job.

Company: ${job.company}
Title: ${job.title}
Location: ${job.location}
Workplace: ${job.workplace}
URL: ${job.url}

Description:
${job.description.slice(0, 30_000)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Model declined to score job ${job.id}`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(`Scoring job ${job.id} hit max_tokens`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Could not parse score for job ${job.id}`);

  const cvIds = new Set(profile.cvs.map((c) => c.id));
  if (!cvIds.has(parsed.best_cv_id)) parsed.best_cv_id = profile.cvs[0].id;
  return parsed;
}
