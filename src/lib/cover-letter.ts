// Cover letter draft built only from facts in your profile. No AI.
// It's a starting point: the queue lets you edit it before approving.

import type { Profile } from "./profile";
import type { CvDocument } from "./tailor";

const INTROS: Record<string, string> = {
  frontend: "I build responsive, production-ready web interfaces with React, Next.js and TypeScript.",
  "virtual-assistant": "I keep inboxes, calendars and day-to-day operations organized so the people I support can focus on their work.",
  "data-annotation": "I'm a detail-oriented annotator who follows labeling guidelines closely and checks my own work for consistency.",
};

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function draftCoverLetter(
  profile: Profile,
  cv: CvDocument,
  job: { title: string; company: string },
  matchedSkills: string[],
): string {
  const b = profile.basics;
  const latest = cv.experience[0];
  // Top points from the tailored CV are already ranked by relevance to this job.
  const highlights = [
    ...cv.experience.flatMap((e) => e.bullets.slice(0, 2).map((x) => x.text)),
    ...cv.projects.flatMap((p) => p.bullets.slice(0, 1).map((x) => x.text)),
  ].slice(0, 3);

  const lines: string[] = [];
  lines.push(`Dear ${job.company} Hiring Team,`);
  lines.push("");
  lines.push(
    `I'm applying for the ${job.title} role at ${job.company}. ${INTROS[cv.cvId] ?? cv.summary}`,
  );
  lines.push("");
  if (latest) {
    const article = /^[aeiou]/i.test(latest.title) ? "an" : "a";
    const where = /^freelance$/i.test(latest.company) ? " (freelance)" : ` at ${latest.company}`;
    lines.push(`From my time as ${article} ${latest.title}${where}, a few things that fit this role:`);
  } else {
    lines.push("A few things from my experience that fit this role:");
  }
  for (const h of highlights) lines.push(`• ${h}`);
  lines.push("");
  if (matchedSkills.length) {
    lines.push(
      `The role calls for ${listJoin(matchedSkills.slice(0, 5))}, which match${matchedSkills.length === 1 ? "es" : ""} the skills on my CV.`,
    );
  }
  lines.push(
    `I'm based in ${b.location} (West Africa Time, UTC+1) and available to work remotely.`,
  );
  const link = cv.cvId === "frontend" ? b.links.portfolio ?? b.links.github : b.links.linkedin;
  if (link) lines.push(`You can see more of my work here: ${link}`);
  lines.push("");
  lines.push(`Thank you for considering my application. I'd welcome the chance to talk about how I can help ${job.company}.`);
  lines.push("");
  lines.push("Best regards,");
  lines.push(b.name);
  lines.push([b.email, b.phone].filter(Boolean).join(" · "));
  return lines.join("\n");
}
