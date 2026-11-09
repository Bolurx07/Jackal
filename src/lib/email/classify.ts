// Rule-based classification of job-search emails. No AI, and nothing is sent anywhere.

export type EmailKind = "confirmation" | "interview" | "assessment" | "rejection" | "offer" | "job_alert";

export interface MailInput {
  fromAddress: string;
  fromName?: string;
  subject: string;
  text: string;
}

/** Senders whose emails are job alerts (lists of new jobs). */
export const ALERT_SENDERS: { source: "linkedin_alert" | "indeed_alert" | "jobberman_alert"; from: RegExp }[] = [
  { source: "linkedin_alert", from: /jobalerts-noreply@linkedin\.com|jobs-listings@linkedin\.com|jobs-noreply@linkedin\.com/i },
  { source: "indeed_alert", from: /@(alert\.)?indeed\.com$|alert@indeed\.com/i },
  { source: "jobberman_alert", from: /@jobberman\.com$/i },
];

const OFFER = /pleased to (offer|extend (you )?an offer)|offer letter|(formal|job|employment) offer|we('d| would) like to offer you/i;

const REJECTION =
  /regret to inform|(not|won't|will not) be (moving|proceeding) forward|decided (not to|to not) (move|proceed)|decided to (move|proceed|go) forward with (other|another)|(pursue|proceed with) other candidates|other candidates (whose|who)|position has (now )?been filled|(have|has) not been selected|not been successful|were not selected|unable to offer you|no longer (being )?considered|not (a|the) (right )?(fit|match) for (this|the) (role|position)/i;
// "Unfortunately" only counts together with application words
const SOFT_REJECTION = /unfortunately[^.]{0,160}(application|candidacy|position|role|move forward|proceed)/i;

const INTERVIEW_STRONG =
  /invit(e|ing) you (to|for) (an?|the|your) (first |initial |next |technical |final )?(interview|call|conversation|chat)|schedule (an?|your|the) (interview|call|phone screen|video call|chat)|book (a|your) (time|slot|interview)|calendly\.com|interview (invitation|invite|request)|like to (speak|chat|talk|meet) with you|next round|phone screen/i;
const ASSESSMENT =
  /take[\s-]?home|coding (challenge|test|assessment|exercise)|technical (assessment|test|challenge|exercise)|hackerrank|codility|testgorilla|codesignal|coderbyte|assessment (link|invitation|invite)|complete (the|this|an|our|a short) (assessment|test|task|quiz)|skills? (test|assessment)/i;
const CONFIRMATION =
  /thank(s| you) for (applying|your application|your interest in)|application (has been |was |is )?(successfully )?(received|submitted)|we('ve| have) received your application|received your application|your application (to|for) .{0,80} (has been|was) (received|submitted)/i;

export function classifyEmail(m: MailInput): EmailKind | null {
  if (ALERT_SENDERS.some((s) => s.from.test(m.fromAddress))) return "job_alert";

  const subject = m.subject;
  const body = m.text.slice(0, 6000);
  const all = `${subject}\n${body}`;

  if (OFFER.test(all) && !/offer(s|ing)? (a )?(competitive|flexible|great|benefits)/i.test(all)) return "offer";
  if (REJECTION.test(all) || SOFT_REJECTION.test(all)) return "rejection";

  const isConfirmation = CONFIRMATION.test(all);
  // Confirmations often say "if selected, we'll reach out to schedule an interview" - that's not an invite.
  const subjectSaysInterview = /interview|next steps|invitation|let'?s (chat|talk)/i.test(subject);
  if (INTERVIEW_STRONG.test(all) && (!isConfirmation || subjectSaysInterview)) return "interview";
  if (ASSESSMENT.test(all) && (!isConfirmation || /assessment|test|challenge|task/i.test(subject))) return "assessment";
  if (isConfirmation) return "confirmation";
  return null;
}

/** Cheap pre-check on sender + subject, so full emails are only downloaded when likely relevant. */
export function maybeRelevant(fromAddress: string, subject: string): boolean {
  if (ALERT_SENDERS.some((s) => s.from.test(fromAddress))) return true;
  if (/greenhouse|lever\.co|ashbyhq|workable|smartrecruiters|bamboohr|recruitee|teamtailor|jobvite|icims|myworkday|personio|breezy|jazzhr|hire\./i.test(fromAddress)) return true;
  return /application|applying|applied|interview|candidate|candidacy|position|role|opportunit|offer|assessment|next steps|thank you for your interest|recruit|hiring|talent/i.test(subject);
}
