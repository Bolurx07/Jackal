// Tests the email classifier and job-alert parser on sample emails (no Gmail needed).
// Usage: npm run jackal:test-email
import { classifyEmail, type EmailKind } from "../src/lib/email/classify";
import { parseAlertEmail } from "../src/lib/email/alerts";
import { locationFilter, titleFilter } from "../src/lib/filters";

const CASES: { name: string; expect: EmailKind | null; from: string; subject: string; text: string }[] = [
  {
    name: "Greenhouse confirmation that mentions a future interview",
    expect: "confirmation",
    from: "no-reply@us.greenhouse-mail.io",
    subject: "Thank you for applying to Hivex",
    text: "Hi Israel, thank you for your interest in Hivex! We have received your application for Frontend Developer. If your experience is a match, we will reach out to schedule an interview.",
  },
  {
    name: "Interview invite",
    expect: "interview",
    from: "talent@hivex.com",
    subject: "Next steps - Frontend Developer",
    text: "Hi Israel, we enjoyed reviewing your application and would like to invite you to an initial interview. Please book a time here: https://calendly.com/hivex/30min",
  },
  {
    name: "Rejection (explicit)",
    expect: "rejection",
    from: "no-reply@hire.lever.co",
    subject: "Your application to Toptal",
    text: "Thank you for applying. After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our needs.",
  },
  {
    name: "Rejection (soft 'unfortunately')",
    expect: "rejection",
    from: "jobs@micro1.ai",
    subject: "Update on your application",
    text: "Unfortunately we won't be able to proceed with your application at this time. We wish you the best.",
  },
  {
    name: "Rejection that mentions interviews",
    expect: "rejection",
    from: "careers@rayyan.ai",
    subject: "Front End Engineer - application update",
    text: "We interviewed many strong candidates. We regret to inform you that you have not been selected for the next round.",
  },
  {
    name: "Take-home assessment",
    expect: "assessment",
    from: "recruiting@talentjourney.com",
    subject: "Technical assessment for Junior Frontend Developer",
    text: "Thanks for applying! As a next step, please complete the coding challenge on HackerRank within 5 days.",
  },
  {
    name: "Offer",
    expect: "offer",
    from: "hr@m365connect.com",
    subject: "Offer - Executive Assistant",
    text: "We are pleased to offer you the position of Executive Assistant. Your offer letter is attached.",
  },
  {
    name: "Marketing email with 'offer' (not job)",
    expect: null,
    from: "deals@shop.com",
    subject: "Black Friday: we offer competitive prices",
    text: "We offer competitive prices and great benefits for members. Shop now!",
  },
  {
    name: "Newsletter (not job)",
    expect: null,
    from: "news@medium.com",
    subject: "Your weekly digest",
    text: "Top stories this week about React and TypeScript.",
  },
  {
    name: "LinkedIn job alert",
    expect: "job_alert",
    from: "jobalerts-noreply@linkedin.com",
    subject: "\"frontend developer\": Hivex - Frontend Developer and more",
    text: "",
  },
];

const LINKEDIN_ALERT = `Your job alert for frontend developer in Lagos
New jobs match your preferences.

Frontend Developer
Paystack
Lagos, Lagos State, Nigeria (Hybrid)
View job: https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc&refId=xyz

Senior React Engineer
Andela
Nigeria (Remote)
Actively recruiting
View job: https://www.linkedin.com/comm/jobs/view/4098765432/?trackingId=def

Virtual Assistant
Acme Corp · Remote
View job: https://www.linkedin.com/comm/jobs/view/4011112222/

See all jobs: https://www.linkedin.com/comm/jobs/search/?keywords=frontend
Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe`;

// Same layout as real LinkedIn alert emails (Nov 2026): cards separated by dashes, badges after
// the location, pay lines, and a second section with its own header. Links shortened.
const LINKEDIN_REAL = [
  "Your job alert for frontend developer in United States",
  "New jobs match your preferences.",
  "Manage alerts: https://www.linkedin.com/comm/jobs/alerts?x=1",
  "",
  "React Developer",
  "TaskVerse",
  "United States",
  "View job: https://www.linkedin.com/comm/jobs/view/4488873861/?trackingId=a&refId=b",
  "",
  "---------------------------------------------------------",
  "",
  "Frontend Engineer",
  "SMARTFOX",
  "United States",
  "Apply with resume & profile",
  "View job: https://www.linkedin.com/comm/jobs/view/4487947381/?trackingId=c",
  "",
  "---------------------------------------------------------",
  "",
  "Junior Web Developer",
  "RoleTalent Ltd",
  "Greater Lincoln Area, United Kingdom",
  "",
  "£50K-£60K / year",
  "This company is actively hiring",
  "View job: https://www.linkedin.com/comm/jobs/view/4487000001/?trackingId=d",
  "",
  "---------------------------------------------------------",
  "",
  "See all jobs on LinkedIn: https://www.linkedin.com/comm/jobs/search-results/?k=1",
  "",
  "New jobs from your other alerts",
  "",
  '<strong class="font-bold">front end supervisor</strong> jobs in Europe',
  "",
  "Front Office Supervisor",
  "Amstel Hotel",
  "Amsterdam",
  "",
  "This company is actively hiring",
  "Apply with resume & profile",
  "View job: https://www.linkedin.com/comm/jobs/view/4487465498/?trackingId=e",
  "",
  "---------------------------------------------------------",
  "",
  "Shift Lead | Wellesley",
  "Blank Street",
  "Wellesley, MA",
  "$21-$34 / hour",
  "View job: https://www.linkedin.com/comm/jobs/view/4488893360/?trackingId=f",
].join("\n");

const INDEED_ALERT = `Data Annotator
Welo Data - Remote
https://ng.indeed.com/rc/clk?jk=abc123def456&from=ja&qd=xyz

Customer Support Assistant
Moniepoint - Lagos
https://ng.indeed.com/rc/clk?jk=999fff000aaa&from=ja`;

let pass = 0;
let fail = 0;
for (const c of CASES) {
  const got = classifyEmail({ fromAddress: c.from, subject: c.subject, text: c.text });
  const ok = got === c.expect;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: ${got ?? "ignored"}${ok ? "" : ` (expected ${c.expect ?? "ignored"})`}`);
}

const now = new Date();
const li = parseAlertEmail("linkedin_alert", LINKEDIN_ALERT, now);
const ind = parseAlertEmail("indeed_alert", INDEED_ALERT, now);
console.log("\nLinkedIn alert parsed:");
for (const j of li) console.log(`  ${j.title} | ${j.company} | ${j.location} | ${j.workplace} | ${j.url}`);
console.log("Indeed alert parsed:");
for (const j of ind) console.log(`  ${j.title} | ${j.company} | ${j.location} | ${j.workplace} | ${j.url}`);

const parseChecks: [string, boolean][] = [
  ["LinkedIn: 3 jobs", li.length === 3],
  ["LinkedIn: first is Frontend Developer at Paystack", li[0]?.title === "Frontend Developer" && li[0]?.company === "Paystack"],
  ["LinkedIn: 'Actively recruiting' ignored", li[1]?.title === "Senior React Engineer" && li[1]?.company === "Andela"],
  ["LinkedIn: 'Company · Remote' split", li[2]?.company === "Acme Corp" && li[2]?.workplace === "remote"],
  ["LinkedIn: tracking removed from link", li[0]?.url === "https://www.linkedin.com/jobs/view/4012345678/"],
  ["Indeed: 2 jobs", ind.length === 2],
  ["Indeed: company/location split", ind[0]?.company === "Welo Data" && ind[0]?.location === "Remote"],
];

// Real LinkedIn layout
const real = parseAlertEmail("linkedin_alert", LINKEDIN_REAL, now);
console.log("LinkedIn (real layout) parsed:");
for (const j of real) console.log(`  ${j.title} | ${j.company} | ${j.location}`);
const want = [
  ["React Developer", "TaskVerse", "United States"],
  ["Frontend Engineer", "SMARTFOX", "United States"],
  ["Junior Web Developer", "RoleTalent Ltd", "Greater Lincoln Area, United Kingdom"],
  ["Front Office Supervisor", "Amstel Hotel", "Amsterdam"],
  ["Shift Lead | Wellesley", "Blank Street", "Wellesley, MA"],
];
parseChecks.push(["Real layout: 5 cards", real.length === 5]);
want.forEach(([t, c, l], i) =>
  parseChecks.push([`Real layout card ${i + 1}: ${t} / ${c} / ${l}`, real[i]?.title === t && real[i]?.company === c && real[i]?.location === l]),
);
parseChecks.push(["Real layout: no badge/pay/header text in any field", !real.some((j) => /actively hiring|apply with|\/ (hour|year)|jobs in|<strong/i.test(`${j.title}|${j.company}|${j.location}`))]);

// Title filter: no retail/hospitality roles, tech titles kept
const job = (title: string) => ({ source: "linkedin_alert" as const, externalId: "x", company: "C", title, url: "", location: "Remote (Worldwide)", workplace: "remote" as const, description: "", postedAt: now });
const drop = ["Front Office Supervisor", "Front End Supervisor", "(USA) Front End Coach", "Front Desk Manager - Hilton Garden Inn", "Front of House Supervisor", "Shift Lead | Wellesley", "Front End Service Team Supervisor", "Retail Front End Supervisor - Full-Time"];
const keep = ["Frontend Team Lead", "Front End Engineer - React /Next.js (Remote)", "UI Lead Software Engineer - React / TypeScript", "Support Team Lead (JavaScript)", "Junior Web Developer", "Frontend Developer"];
for (const t of drop) parseChecks.push([`Filter drops: ${t}`, !titleFilter(job(t)).pass]);
for (const t of keep) parseChecks.push([`Filter keeps: ${t}`, titleFilter(job(t)).pass]);

// A "Worldwide" location from a remote-anywhere alert counts as remote and passes the location rule
const ww = parseAlertEmail("linkedin_alert", "Frontend Developer\nAcme\nWorldwide\nView job: https://www.linkedin.com/comm/jobs/view/4000000001/?x=1", now)[0];
parseChecks.push(["Worldwide alert job counts as remote", ww?.workplace === "remote"]);
parseChecks.push(["Worldwide alert job passes the location rule", !!ww && locationFilter(ww).pass]);
const us = parseAlertEmail("linkedin_alert", "Frontend Developer\nAcme\nUnited States\nView job: https://www.linkedin.com/comm/jobs/view/4000000002/?x=1", now)[0];
parseChecks.push(["'United States' alert job is still dropped (abroad, not marked remote)", !!us && !locationFilter(us).pass]);

// "through to the assessment" is an assessment, not a confirmation
parseChecks.push([
  "Assessment: 'you're through to the assessment'",
  classifyEmail({ fromAddress: "hello@koya.example", subject: "Your Koya application: you're through to the assessment", text: "Thank you for your application. You're through to the assessment stage." }) === "assessment",
]);
for (const [name, ok] of parseChecks) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
