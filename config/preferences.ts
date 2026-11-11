// Your job-search preferences. Edit this file to change what Jackal looks for.

export const preferences = {
  /** A job title must match at least one of these (case-insensitive) to be considered. */
  targetTitlePatterns: [
    /front[\s-]?end/i,
    /full[\s-]?stack/i,
    /software (engineer|developer)/i,
    /react/i,
    /next\.?js/i,
    /typescript/i,
    /web developer/i,
    /javascript/i,
    /\bai\b.*(automation|engineer)/i,
    /automation (engineer|developer)/i,
    /wordpress/i,
    // Virtual assistant / admin
    /virtual assistant/i,
    /(executive|administrative|admin|personal|operations|office) assistant/i,
    /customer (support|service)/i,
    /data entry/i,
    // Data annotation / AI training
    /annotat/i,
    /data label/i,
    /label(l)?er/i,
    /\bai (trainer|training|tutor)\b/i,
    /\b(data|search|content|ai) (rater|evaluator)\b/i,
  ],

  /**
   * Retail and hospitality roles that share words with tech titles ("Front End Supervisor" at a
   * supermarket, "Front Office Supervisor" at a hotel). Dropped unless the title is clearly tech.
   */
  nonTechTitlePatterns: [
    /\bfront[\s-]?(end|office|desk|of house)\b/i,
    /\b(shift|store|floor|team|crew|cashier|service) (lead|leader|supervisor|coach|manager|associate|member)\b/i,
    /\b(cashier|barista|retail|hotel|restaurant|housekeeping|concierge|merchandis)/i,
  ],
  techTitleWords: /(engineer|develop|software|programm|\bweb\b|\bui\b|\bux\b|react|angular|vue|javascript|typescript|next\.?js|wordpress|full[\s-]?stack|front[\s-]?end (dev|eng|web|team lead))/i,

  /** Search terms for Himalayas (remote jobs open to candidates in Nigeria). */
  himalayasQueries: [
    "frontend developer",
    "react developer",
    "software engineer",
    "virtual assistant",
    "executive assistant",
    "data annotation",
    "data labeling",
    "ai trainer",
  ],
  /** Pages of 20 results per Himalayas query. */
  himalayasPages: 2,

  /** A job title matching any of these is dropped. Adjust to your seniority. */
  excludeTitlePatterns: [
    /\b(principal|staff|director|head of|vp|vice president|manager)\b/i,
    /\b(intern|internship)\b/i,
    /\b(ios|android|embedded|firmware|sre|devops|data scientist)\b/i,
  ],

  /**
   * Location rules:
   * - Jobs in Nigeria: onsite, hybrid or remote are all fine.
   * - Jobs anywhere else (USA, Australia, Europe, ...): must be remote.
   */
  homeCountry: "Nigeria",
  homeLocationPatterns: [
    /nigeria/i,
    /\blagos\b/i,
    /\babuja\b/i,
    /port[\s-]?harcourt/i,
    /\bibadan\b/i,
    /\bkano\b/i,
    /\benugu\b/i,
    /\bbenin city\b/i,
    /\babeokuta\b/i,
  ],

  /**
   * Many "remote" jobs abroad are limited to one country or region ("Remote - Germany",
   * "Remote (US only)"). Those usually need local residency or work rights, so they are
   * filtered out unless the location mentions one of these open regions.
   * Filtered jobs are still saved with a reason, so nothing disappears silently.
   */
  openRemoteRegionPatterns: [
    /worldwide/i,
    /anywhere/i,
    /global/i,
    /\bemea\b/i,
    /africa/i,
    /nigeria/i,
    /unspecified/i,
    /^\s*distributed\s*$/i,
    /^\s*remote\s*$/i,
  ],
  allowRegionLockedRemote: false,

  /** Ignore aggregator postings (Remotive, Himalayas) older than this many days. */
  maxAgeDays: 30,

  /** Jobs scoring at or above this are shortlisted (keyword or AI score). */
  shortlistThreshold: 70,

  /**
   * Optional AI scoring. Only used when ANTHROPIC_API_KEY is set in .env.local.
   * Every job always gets a free keyword score first; AI then re-scores only the
   * best keyword matches, to keep cost low.
   */
  aiMinKeywordScore: 40,
  maxAiScoresPerRun: 20,

  /**
   * After scoring, prepare applications (tailored CV + cover letter + answers) for the
   * best shortlisted jobs that don't have one yet. They wait in the queue for your review.
   */
  autoPrepareTopN: 10,
  /** Don't let the review queue pile up: stop preparing while this many are awaiting review. */
  maxAwaitingReview: 25,
  /** Variety: at most this many auto-prepared applications per company per run. */
  autoPrepareMaxPerCompany: 2,
} as const;
