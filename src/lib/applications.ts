import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobScores, jobs } from "@/db/schema";
import { loadProfile } from "./profile";
import { tailorCv } from "./tailor";
import { draftCoverLetter } from "./cover-letter";
import { loadAnswers } from "./answers";

/**
 * Prepare an application for one job: tailored CV, cover letter draft and answers,
 * saved to the queue as "awaiting_approval". Re-preparing replaces the draft.
 */
export async function prepareApplication(jobId: number, cvOverride?: string): Promise<number> {
  const profile = loadProfile();
  if (!profile) throw new Error("No data/profile/profile.yaml yet.");

  const [row] = await db
    .select({ job: jobs, score: jobScores })
    .from(jobs)
    .leftJoin(jobScores, eq(jobScores.jobId, jobs.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) throw new Error(`Job ${jobId} not found`);

  const cvId = cvOverride ?? row.score?.bestCvId ?? profile.cvs[0].id;
  const { original, tailored, changes, matchedSkills } = tailorCv(profile, cvId, row.job);
  const coverLetter = draftCoverLetter(profile, tailored, row.job, matchedSkills);
  const values = {
    cvId: tailored.cvId,
    status: "awaiting_approval",
    tailoredCv: tailored,
    originalCv: original,
    changes,
    coverLetter,
    answers: loadAnswers(),
    decisionNote: null,
    decidedAt: null,
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(applications)
    .values({ jobId, ...values })
    .onConflictDoUpdate({ target: applications.jobId, set: values })
    .returning({ id: applications.id });
  return saved.id;
}
