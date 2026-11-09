// Company watchlist. Jackal reads these companies' public job boards directly
// (no scraping, no login). Add companies you'd like to work for.
//
// How to find a company's slug:
//   Greenhouse: boards.greenhouse.io/<slug>  or  job-boards.greenhouse.io/<slug>
//   Lever:      jobs.lever.co/<slug>
//   Ashby:      jobs.ashbyhq.com/<slug>
// If a slug is wrong, the run logs a warning and carries on.
//
// All slugs below were checked as live on 2026-11-08.

export type Ats = "greenhouse" | "lever" | "ashby";

export interface WatchedCompany {
  name: string;
  ats: Ats;
  slug: string;
}

export const companies: WatchedCompany[] = [
  // Greenhouse
  { name: "Vercel", ats: "greenhouse", slug: "vercel" },
  { name: "GitLab", ats: "greenhouse", slug: "gitlab" },
  { name: "Automattic", ats: "greenhouse", slug: "automatticcareers" },
  { name: "Netlify", ats: "greenhouse", slug: "netlify" },
  { name: "Cloudflare", ats: "greenhouse", slug: "cloudflare" },
  { name: "Twilio", ats: "greenhouse", slug: "twilio" },
  // Ashby
  { name: "Supabase", ats: "ashby", slug: "supabase" },
  { name: "Linear", ats: "ashby", slug: "linear" },
  { name: "PostHog", ats: "ashby", slug: "posthog" },
  { name: "Zapier", ats: "ashby", slug: "zapier" },
  { name: "n8n", ats: "ashby", slug: "n8n" },
  { name: "Resend", ats: "ashby", slug: "resend" },
  // Lever
  { name: "Toptal", ats: "lever", slug: "toptal" },
];
