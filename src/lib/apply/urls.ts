import type { Job } from "@/db/schema";

/** Where the application form lives for each source. */
export function applyUrl(job: Pick<Job, "source" | "externalId" | "url">): string {
  switch (job.source) {
    case "greenhouse": {
      // externalId = "<slug>:<id>". The hosted board page contains the form.
      const [slug, id] = job.externalId.split(":");
      return slug && id ? `https://job-boards.greenhouse.io/${slug}/jobs/${id}` : job.url;
    }
    case "lever":
      return job.url.replace(/\/?$/, "/apply");
    case "ashby":
      return job.url.replace(/\/?$/, "/application");
    default:
      // Aggregators (Himalayas, Remotive) link to their listing or the company's own form.
      // Jackal follows you: whatever form you open in that browser gets filled.
      return job.url;
  }
}
