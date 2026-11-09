// CV tailoring without AI and without inventing anything.
//
// Tailoring = choosing and ordering facts that already exist in profile.yaml:
//   - skills the job asks for move to the front; matching skills from your other CVs are added
//   - bullets inside each role are reordered so the most relevant come first
//   - projects are reordered, and a relevant project from another CV can be swapped in
//   - a "key skills for this role" line lists matched skills (all verified)
// Every tailored CV is checked against the fact bank before it's saved (verifyCv).

import type { Profile } from "./profile";
import { skillsMentioned } from "./keyword-scorer";

export interface CvBullet {
  id: string;
  text: string;
}

export interface CvDocument {
  cvId: string;
  label: string;
  name: string;
  contact: string[]; // location, email, phone, links
  headline: string;
  summary: string;
  focusLine: string | null;
  skills: string[];
  experience: {
    id: string;
    title: string;
    company: string;
    location?: string;
    dates: string;
    bullets: CvBullet[];
  }[];
  projects: { id: string; name: string; url?: string; stack: string[]; bullets: CvBullet[] }[];
  education: { institution: string; qualification: string; year?: string }[];
  certifications: string[];
}

export interface CvChange {
  kind: "skills_reordered" | "skill_added" | "bullets_reordered" | "project_added" | "project_removed" | "projects_reordered" | "focus_line";
  detail: string;
}

export interface TailorResult {
  original: CvDocument;
  tailored: CvDocument;
  changes: CvChange[];
  matchedSkills: string[];
}

const STOP = new Set(
  "about above across after again against along also among and another any are around because been before being below between both but can could did does doing down during each either else ever every from further had has have having here into its itself just more most must need other over own same should some such than that the their them then there these they this those through under until upon very want was were what when where which while who whom why will with within without would you your yours team work working role experience strong ability using used build built".split(
    " ",
  ),
);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

const lc = (s: string) => s.toLowerCase();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-09" -> "Sep 2022"; "2020" stays "2020". */
function prettyDate(d: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(d);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : d;
}

function dates(start?: string, end?: string): string {
  if (!start) return "";
  return `${prettyDate(start)} – ${end ? prettyDate(end) : "Present"}`;
}

/** Relevance of a bullet to the job: shared skills count most, then shared words. */
function relevance(text: string, tags: string[], jobSkills: Set<string>, jobWords: Set<string>): number {
  const skillHits = skillsMentioned(text).filter((s) => jobSkills.has(lc(s))).length;
  const tagHits = tags.filter((t) => jobWords.has(lc(t).replace(/-/g, ""))).length;
  let wordHits = 0;
  for (const w of words(text)) if (jobWords.has(w)) wordHits++;
  return skillHits * 3 + tagHits * 2 + Math.min(wordHits, 4) * 0.5;
}

/** Stable sort by score, highest first (ties keep original order). */
function rank<T>(items: T[], score: (t: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

function sameOrder(a: { id: string }[], b: { id: string }[]) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id);
}

/** The CV exactly as it is in your library (no tailoring). */
export function buildBaseCv(profile: Profile, cvId: string): CvDocument {
  const cv = profile.cvs.find((c) => c.id === cvId) ?? profile.cvs[0];
  const exp = new Map(profile.experience.map((e) => [e.id, e]));
  const proj = new Map(profile.projects.map((p) => [p.id, p]));
  const b = profile.basics;
  return {
    cvId: cv.id,
    label: cv.label,
    name: b.name,
    contact: [
      b.location,
      b.email,
      b.phone,
      ...Object.entries(b.links)
        .filter(([k]) => !cv.links || cv.links.includes(k))
        .map(([, v]) => v),
    ].filter((x): x is string => !!x),
    headline: cv.headline,
    summary: cv.summary,
    focusLine: null,
    skills: [...cv.skills],
    experience: cv.experienceIds
      .map((id) => exp.get(id))
      .filter((e) => !!e)
      .map((e) => ({
        id: e.id,
        title: e.title,
        company: e.company,
        location: e.location,
        dates: dates(e.start, e.end),
        bullets: e.bullets.map(({ id, text }) => ({ id, text })),
      })),
    projects: cv.projectIds
      .map((id) => proj.get(id))
      .filter((p) => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        stack: [...p.stack],
        bullets: p.bullets.map(({ id, text }) => ({ id, text })),
      })),
    education: profile.education.map((e) => ({ ...e })),
    certifications: [...profile.certifications],
  };
}

export function tailorCv(
  profile: Profile,
  cvId: string,
  job: { title: string; description: string },
): TailorResult {
  const original = buildBaseCv(profile, cvId);
  const cvDef = profile.cvs.find((c) => c.id === original.cvId)!;
  const jobText = `${job.title}\n${job.description}`;
  const jobSkillList = skillsMentioned(jobText);
  const jobSkills = new Set(jobSkillList.map(lc));
  const jobWords = words(jobText);
  const changes: CvChange[] = [];

  // --- Skills: matched first; add verified profile skills the job asks for, but never a skill
  // that belongs to a different kind of CV (no "Meeting scheduling" on a frontend CV).
  const youHave = new Map(profile.skills.map((s) => [lc(s), s]));
  const onCv = new Set(original.skills.map(lc));
  const otherCvSkills = new Set(
    profile.cvs.filter((c) => c.id !== original.cvId).flatMap((c) => c.skills.map(lc)),
  );
  const matchedOnCv = original.skills.filter((s) => jobSkills.has(lc(s)));
  const added = jobSkillList
    .filter((s) => youHave.has(lc(s)) && !onCv.has(lc(s)) && !otherCvSkills.has(lc(s)))
    .map((s) => youHave.get(lc(s))!);
  const rest = original.skills.filter((s) => !jobSkills.has(lc(s)));
  const skills = [...matchedOnCv, ...added, ...rest];
  if (matchedOnCv.length && original.skills.slice(0, matchedOnCv.length).some((s, i) => s !== matchedOnCv[i])) {
    changes.push({ kind: "skills_reordered", detail: `Moved to the front: ${matchedOnCv.join(", ")}` });
  }
  for (const s of added) {
    changes.push({ kind: "skill_added", detail: `${s} (from your profile; the job mentions it)` });
  }
  const matchedSkills = [...matchedOnCv, ...added];

  // --- Bullets inside each role, most relevant first
  const tagsById = new Map<string, string[]>();
  for (const e of profile.experience) for (const b of e.bullets) tagsById.set(b.id, b.tags);
  for (const p of profile.projects) for (const b of p.bullets) tagsById.set(b.id, b.tags);
  const bulletScore = (b: CvBullet) => relevance(b.text, tagsById.get(b.id) ?? [], jobSkills, jobWords);

  const experience = original.experience.map((e) => {
    const bullets = rank(e.bullets, bulletScore);
    if (!sameOrder(bullets, e.bullets)) {
      changes.push({ kind: "bullets_reordered", detail: `${e.title} at ${e.company}: most relevant points moved up` });
    }
    return { ...e, bullets };
  });

  // --- Projects: rank this CV's projects plus any relevant project from your other CVs
  const projectScore = (p: CvDocument["projects"][number]) =>
    p.bullets.reduce((sum, b) => sum + bulletScore(b), 0) +
    p.stack.filter((s) => jobSkills.has(lc(s))).length * 3;
  const own = original.projects;
  const ownIds = new Set(own.map((p) => p.id));
  const others = profile.projects
    .filter((p) => !ownIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, url: p.url, stack: [...p.stack], bullets: p.bullets.map(({ id, text }) => ({ id, text })) }))
    .filter((p) => projectScore(p) >= 8);
  const maxProjects = Math.max(own.length, 3);
  const projects = rank([...own, ...others], projectScore)
    .slice(0, maxProjects)
    .map((p) => ({ ...p, bullets: rank(p.bullets, bulletScore) }));
  const keptIds = new Set(projects.map((p) => p.id));
  for (const p of projects) if (!ownIds.has(p.id)) changes.push({ kind: "project_added", detail: `${p.name} (from your profile)` });
  for (const p of own) if (!keptIds.has(p.id)) changes.push({ kind: "project_removed", detail: `${p.name} (less relevant to this job)` });
  if (!changes.some((c) => c.kind.startsWith("project_")) && !sameOrder(projects, own)) {
    changes.push({ kind: "projects_reordered", detail: "Most relevant projects moved up" });
  }

  // --- Focus line under the summary (only verified, matched skills)
  const focus = matchedSkills.slice(0, 8);
  const focusLine = focus.length >= 2 ? `Key skills for this role: ${focus.join(", ")}.` : null;
  if (focusLine) changes.push({ kind: "focus_line", detail: focusLine });

  const tailored: CvDocument = {
    ...original,
    headline: cvDef.headline,
    focusLine,
    skills,
    experience,
    projects,
  };

  const problems = verifyCv(profile, tailored);
  if (problems.length) {
    throw new Error(`Tailored CV failed the fact check:\n- ${problems.join("\n- ")}`);
  }
  return { original, tailored, changes, matchedSkills };
}

/** Returns every statement in the CV that is NOT backed by the fact bank. Empty = all good. */
export function verifyCv(profile: Profile, cv: CvDocument): string[] {
  const problems: string[] = [];
  const skills = new Set(profile.skills.map(lc));
  const bulletText = new Map<string, string>();
  for (const e of profile.experience) for (const b of e.bullets) bulletText.set(b.id, b.text);
  for (const p of profile.projects) for (const b of p.bullets) bulletText.set(b.id, b.text);
  const exp = new Map(profile.experience.map((e) => [e.id, e]));
  const proj = new Map(profile.projects.map((p) => [p.id, p]));
  const cvDef = profile.cvs.find((c) => c.id === cv.cvId);

  if (!cvDef) problems.push(`Unknown CV "${cv.cvId}"`);
  else {
    if (cv.summary !== cvDef.summary) problems.push("Summary differs from your CV");
    if (cv.headline !== cvDef.headline) problems.push("Headline differs from your CV");
  }
  for (const s of cv.skills) if (!skills.has(lc(s))) problems.push(`Skill not in your profile: ${s}`);
  for (const e of cv.experience) {
    const src = exp.get(e.id);
    if (!src) problems.push(`Unknown role: ${e.title} at ${e.company}`);
    else if (src.title !== e.title || src.company !== e.company) problems.push(`Role title/company changed: ${e.id}`);
    for (const b of e.bullets) if (bulletText.get(b.id) !== b.text) problems.push(`Bullet not in your profile: "${b.text}"`);
  }
  for (const p of cv.projects) {
    if (!proj.has(p.id)) problems.push(`Unknown project: ${p.name}`);
    for (const b of p.bullets) if (bulletText.get(b.id) !== b.text) problems.push(`Bullet not in your profile: "${b.text}"`);
  }
  if (cv.focusLine) {
    const listed = cv.focusLine.replace(/^Key skills for this role:\s*/, "").replace(/\.$/, "").split(/,\s*/);
    for (const s of listed) if (!skills.has(lc(s))) problems.push(`Focus line skill not in your profile: ${s}`);
  }
  return problems;
}
