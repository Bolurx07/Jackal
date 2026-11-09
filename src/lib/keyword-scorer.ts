// Free, offline job scorer. No AI: it compares the job's title and the skills it mentions
// against each CV in your profile, and picks the CV that fits best.

import type { Job } from "@/db/schema";
import type { Profile } from "./profile";
import type { ScoreResult } from "./scoring";

export const KEYWORD_MODEL = "keyword-v1";

/**
 * Skill lexicon: canonical name -> patterns that mean that skill in a job description.
 * It includes skills you DON'T have, so the scorer can list what a job needs that you lack.
 * Names must match the spelling used in profile.yaml `skills`.
 */
const LEXICON: Record<string, RegExp> = {
  // Frontend / engineering
  JavaScript: /\bjavascript\b|\bes6\b/i,
  TypeScript: /\btypescript\b/i,
  React: /\breact(\.?js)?\b(?!\s*native)/i,
  "Next.js": /\bnext\.?js\b/i,
  "Node.js": /\bnode(\.?js)?\b/i,
  Express: /\bexpress(\.?js)?\b/i,
  "React Router": /\breact router\b/i,
  "REST APIs": /\brest(ful)?\b|\bapi integration/i,
  "Tailwind CSS": /\btailwind/i,
  "Material UI": /\bmaterial[\s-]?ui\b|\bmui\b/i,
  Bootstrap: /\bbootstrap\b/i,
  Firebase: /\bfirebase\b/i,
  MySQL: /\bmysql\b/i,
  Git: /\bgit\b/i,
  CSS: /\bcss3?\b/i,
  SASS: /\bs[ac]ss\b/i,
  HTML: /\bhtml5?\b/i,
  WordPress: /\bwordpress\b/i,
  "Responsive design": /\bresponsive\b/i,
  Accessibility: /\baccessib|\bwcag\b|\ba11y\b/i,
  "AI chatbot integration": /\bchatbot|\bai assistant|\bllm\b/i,
  Agile: /\bagile\b|\bscrum\b/i,
  // Skills not on your CVs (shown as gaps when a job asks for them)
  "Vue.js": /\bvue(\.?js)?\b/i,
  Angular: /\bangular\b/i,
  Svelte: /\bsvelte/i,
  "React Native": /\breact native\b/i,
  GraphQL: /\bgraphql\b/i,
  PostgreSQL: /\bpostgres(ql)?\b/i,
  MongoDB: /\bmongo(db)?\b/i,
  Python: /\bpython\b/i,
  Go: /\bgolang\b|\bgo\s*\(?lang/i,
  Java: /\bjava\b(?!script)/i,
  Ruby: /\bruby\b|\brails\b/i,
  PHP: /\bphp\b/i,
  Rust: /\brust\b/i,
  "C#": /\bc#|\.net\b/i,
  AWS: /\baws\b|amazon web services/i,
  Docker: /\bdocker\b/i,
  Kubernetes: /\bkubernetes\b|\bk8s\b/i,
  Testing: /\bjest\b|\bcypress\b|\bplaywright\b|\bvitest\b|testing library/i,
  Redux: /\bredux\b/i,
  Figma: /\bfigma\b/i,
  // Virtual assistant / admin
  "Email management": /\b(e-?mail|inbox) (management|handling)|manag\w* (e-?mail|inbox)/i,
  "Calendar management": /\bcalendar/i,
  "Meeting scheduling": /\bschedul/i,
  Zoom: /\bzoom\b/i,
  "Customer support": /\bcustomer (support|service|success)|client (support|communication)/i,
  "Phone support": /\bphone|\bcalls?\b/i,
  "File organization": /\bfil(e|ing) (organi|management)|document management/i,
  "Database maintenance": /\bdatabase|\bcrm\b/i,
  "Spreadsheet management": /\bspreadsheet/i,
  "Microsoft Office": /\b(microsoft|ms) office\b|\boffice 365\b|\bmicrosoft 365\b/i,
  "Microsoft Excel": /\bexcel\b/i,
  "Microsoft Word": /\b(ms|microsoft) word\b/i,
  "Social media management": /\bsocial media\b/i,
  "Report writing": /\breport(s|ing)?\b/i,
  "Google Workspace": /\bgoogle (workspace|sheets|docs|drive)\b|\bg ?suite\b/i,
  "Data entry": /\bdata entry\b/i,
  Bookkeeping: /\bbookkeep|\bquickbooks\b|\bxero\b/i,
  "Project management tools": /\basana\b|\btrello\b|\bclickup\b|\bmonday\.com\b|\bnotion\b/i,
  HubSpot: /\bhubspot\b/i,
  Salesforce: /\bsalesforce\b/i,
  // Data annotation
  "Data annotation": /\bannotat/i,
  "Data labeling": /\blabel(l)?ing\b|\blabel(l)?er\b/i,
  "Label Studio": /\blabel studio\b/i,
  CVAT: /\bcvat\b/i,
  "Image annotation": /\bimage (annotation|labell?ing)|bounding box|segmentation/i,
  "Video annotation": /\bvideo (annotation|labell?ing)/i,
  "Quality review": /\bquality (review|assurance|control|check)|\bqa\b/i,
  "Guideline adherence": /\bguidelines?\b/i,
  "Edge-case identification": /\bedge[\s-]cases?\b/i,
  Transcription: /\btranscri(be|ption)/i,
  RLHF: /\brlhf\b|human feedback|\bpreference (ranking|data)/i,
  "Foreign language fluency": /\bfluen(t|cy) in (?!english)\w+|native (speaker|level) (of|in)? ?(?!english)\w+/i,
};

/** Canonical skill names (from the lexicon) that appear in a piece of text. */
export function skillsMentioned(text: string): string[] {
  return Object.entries(LEXICON)
    .filter(([, re]) => re.test(text))
    .map(([name]) => name);
}

/** Hard signals that a remote job may not accept someone based in Nigeria. */
const ELIGIBILITY_FLAGS: [RegExp, string][] = [
  [/\b(us|u\.s\.|united states) citizen/i, "Asks for US citizenship"],
  [/security clearance/i, "Needs a security clearance"],
  [/(authori[sz]ed|eligible|right) to work in (the )?(us|u\.s\.|united states|uk|united kingdom|canada|eu|europe|australia)/i, "Asks for local work authorization"],
  [/(must|need to|required to) (be )?(reside|live|located|based) in (?!nigeria|africa|emea)/i, "Asks you to live in a specific country"],
  [/(do not|don't|cannot|can't|unable to) (offer|provide) (visa )?sponsorship/i, "No visa sponsorship (fine if fully remote)"],
  [/\b(est|pst|cst|eastern|pacific|central) (time|hours)\b.*\b(overlap|required|must)/i, "Needs US timezone overlap"],
];

const SENIOR = /\b(senior|sr\.?|lead|staff|principal|expert)\b/i;

/** Languages that AI-training / annotation / support jobs often require. */
const LANGUAGES = [
  "Afrikaans", "Albanian", "Amharic", "Arabic", "Armenian", "Bengali", "Bulgarian", "Burmese", "Cantonese",
  "Catalan", "Chinese", "Croatian", "Czech", "Danish", "Dutch", "Estonian", "Farsi", "Persian", "Filipino",
  "Tagalog", "Finnish", "French", "German", "Greek", "Gujarati", "Hausa", "Hebrew", "Hindi", "Hungarian",
  "Icelandic", "Igbo", "Indonesian", "Italian", "Japanese", "Kannada", "Kazakh", "Khmer", "Korean", "Lao",
  "Latvian", "Lithuanian", "Macedonian", "Malay", "Malayalam", "Mandarin", "Marathi", "Nepali", "Norwegian",
  "Pashto", "Polish", "Portuguese", "Punjabi", "Romanian", "Russian", "Serbian", "Sinhala", "Slovak",
  "Slovenian", "Somali", "Spanish", "Swahili", "Swedish", "Tamil", "Telugu", "Thai", "Turkish", "Ukrainian",
  "Urdu", "Uzbek", "Vietnamese", "Welsh", "Xhosa", "Yoruba", "Zulu",
];

/** Languages named as a requirement: in the title, or as "fluent in X" / "native X speaker". */
function requiredLanguages(title: string, description: string): string[] {
  const found = new Set<string>();
  for (const lang of LANGUAGES) {
    const inTitle = new RegExp(`\\b${lang}\\b`, "i").test(title);
    const asRequirement = new RegExp(
      `(fluen(t|cy)|native|proficien(t|cy)|bilingual)[^.\\n]{0,40}\\b${lang}\\b|\\b${lang}\\b[^.\\n]{0,20}(native|fluen(t|cy)|speaker|proficien)`,
      "i",
    ).test(description);
    if (inTitle || asRequirement) found.add(lang);
  }
  return [...found];
}
const JUNIOR = /\b(junior|jr\.?|entry[\s-]level|graduate|associate|trainee)\b/i;

/** Finds the largest "N+ years" requirement in the description, if any. */
function requiredYears(text: string): number | null {
  const re = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)(?:\s+of)?(?:\s+\w+){0,4}?\s+(?:experience|exp\b)/gi;
  let max: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    if (n > 0 && n < 20) max = Math.max(max ?? 0, n);
  }
  return max;
}

function canonical(skill: string): string {
  return skill.trim().toLowerCase();
}

interface CvFit {
  cvId: string;
  score: number;
  titleMatch: boolean;
  matched: string[];
  missing: string[];
  seniority: ScoreResult["seniority_fit"];
}

export function keywordScore(job: Job, profile: Profile, shortlistThreshold: number): ScoreResult {
  const text = `${job.title}\n${job.description}`;
  const title = job.title.toLowerCase();

  // Job-alert emails only give a title: judge on that, and say so.
  if (job.description.trim().length < 150) {
    const cv = profile.cvs.find((c) => c.titleKeywords.some((k) => title.includes(k.toLowerCase())));
    const spoken = new Set(profile.basics.languages.map((l) => l.toLowerCase()));
    const langGaps = requiredLanguages(job.title, "").filter((l) => !spoken.has(l.toLowerCase()));
    const senior = SENIOR.test(job.title) && (cv?.yearsOfExperience ?? 0) < 5;
    const score = cv ? (langGaps.length ? 30 : senior ? 60 : 72) : 30;
    return {
      score,
      recommended: score >= shortlistThreshold,
      best_cv_id: cv?.id ?? profile.cvs[0].id,
      role_category: cv?.label ?? "Unclear",
      matched_skills: [],
      missing_must_haves: [],
      seniority_fit: senior ? "under" : "unclear",
      eligibility_concerns: langGaps.length ? [`Needs ${langGaps.join(" / ")} fluency`] : [],
      reasoning: `${cv ? `Title fits your ${cv.label}.` : "Title doesn't match your CVs."} Only the title is known (from a job alert email): open the posting to check requirements and location. (Keyword score, no AI.)`,
    };
  }

  // Skills the job mentions
  const jobSkills = skillsMentioned(text);

  const youHave = new Set(profile.skills.map(canonical));
  const reqYears = requiredYears(job.description);

  const fits: CvFit[] = profile.cvs.map((cv) => {
    const cvSkills = new Set(cv.skills.map(canonical));
    const titleMatch = cv.titleKeywords.some((k) => title.includes(k.toLowerCase()));

    // Only count skills that belong to this kind of role: ones on this CV, or gaps you don't have.
    const relevant = jobSkills.filter((s) => cvSkills.has(canonical(s)) || !youHave.has(canonical(s)));
    const matched = relevant.filter((s) => cvSkills.has(canonical(s)));
    const missing = relevant.filter((s) => !youHave.has(canonical(s)));

    // Coverage of the job's skills, with diminishing penalty for long "nice to have" lists.
    // Confidence: a job that names only one or two of your skills can't score full marks.
    const coverage =
      matched.length + missing.length === 0 ? 0.3 : matched.length / (matched.length + Math.min(missing.length, 6) * 0.8);
    const confidence = Math.min(1, matched.length / 4);
    const skillPoints = 45 * coverage * (0.4 + 0.6 * confidence);

    let seniority: CvFit["seniority"] = "unclear";
    let seniorityPoints = 12;
    if (reqYears != null) {
      if (cv.yearsOfExperience >= reqYears) {
        seniority = "match";
        seniorityPoints = 20;
      } else if (cv.yearsOfExperience + 1 >= reqYears) {
        seniority = "match";
        seniorityPoints = 14;
      } else {
        seniority = "under";
        seniorityPoints = 0;
      }
    } else if (SENIOR.test(job.title)) {
      seniority = cv.yearsOfExperience >= 5 ? "match" : "under";
      seniorityPoints = cv.yearsOfExperience >= 5 ? 12 : 0;
    } else if (JUNIOR.test(job.title)) {
      seniority = cv.yearsOfExperience <= 3 ? "match" : "over";
      seniorityPoints = 20;
    }

    const score = Math.round((titleMatch ? 35 : 0) + skillPoints + seniorityPoints);
    return { cvId: cv.id, score, titleMatch, matched, missing, seniority };
  });

  fits.sort((a, b) => b.score - a.score);
  const best = fits[0];

  const concerns = ELIGIBILITY_FLAGS.filter(([re]) => re.test(job.description)).map(([, msg]) => msg);
  const spoken = new Set(profile.basics.languages.map((l) => l.toLowerCase()));
  const langGaps = requiredLanguages(job.title, job.description).filter((l) => !spoken.has(l.toLowerCase()));
  if (langGaps.length) concerns.unshift(`Needs ${langGaps.join(" / ")} fluency`);
  const hardConcern = concerns.some((c) => !c.startsWith("No visa sponsorship"));
  const penalty = langGaps.length ? 45 : hardConcern ? 20 : 0;
  const score = Math.max(0, Math.min(100, best.score - penalty));

  const cvLabel = profile.cvs.find((c) => c.id === best.cvId)?.label ?? best.cvId;
  const parts = [
    best.titleMatch ? `Title fits your ${cvLabel}.` : `Title is not a direct match for any of your CVs; closest is the ${cvLabel}.`,
    best.matched.length
      ? `Matches ${best.matched.length} skill(s) the job mentions${best.missing.length ? `, missing ${best.missing.length}` : ""}.`
      : "The description names few skills you list.",
    reqYears != null ? `Asks for about ${reqYears}+ years.` : "",
    concerns.length ? `Check eligibility: ${concerns.join("; ")}.` : "",
    "(Keyword score, no AI.)",
  ];

  return {
    score,
    recommended: score >= shortlistThreshold && !hardConcern,
    best_cv_id: best.cvId,
    role_category: cvLabel,
    matched_skills: best.matched,
    missing_must_haves: best.missing,
    seniority_fit: best.seniority,
    eligibility_concerns: concerns,
    reasoning: parts.filter(Boolean).join(" "),
  };
}
