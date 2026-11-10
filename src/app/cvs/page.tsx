import { statSync } from "node:fs";
import { connection } from "next/server";
import { Suspense } from "react";
import { count, eq } from "drizzle-orm";
import { ChevronDown, FileText, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { loadProfile, PROFILE_PATH } from "@/lib/profile";
import { buildBaseCv } from "@/lib/tailor";
import { CvView } from "@/components/cv-view";
import { Badge, Card, EmptyState, PageHeader, cx, pageClass, timeAgo } from "@/components/ui";

export default function CvLibraryPage() {
  return (
    <Suspense fallback={<main className={cx(pageClass, "text-muted")}>Loading…</main>}>
      <Library />
    </Suspense>
  );
}

async function Library() {
  await connection(); // render per request (shows live times)
  const profile = loadProfile();
  if (!profile) {
    return (
      <main className={pageClass}>
        <PageHeader title="CV Library" />
        <EmptyState icon={<FileText className="size-6" />} title="No profile yet">
          Create data/profile/profile.yaml (see profile.example.yaml).
        </EmptyState>
      </main>
    );
  }

  const updated = statSync(PROFILE_PATH).mtime;
  const usage = await db
    .select({ cvId: applications.cvId, status: applications.status, n: count() })
    .from(applications)
    .groupBy(applications.cvId, applications.status);
  const used = (cvId: string, status?: string) =>
    usage.filter((u) => u.cvId === cvId && (!status || u.status === status)).reduce((s, u) => s + u.n, 0);
  const [{ total }] = await db.select({ total: count() }).from(applications).where(eq(applications.status, "submitted"));

  const exp = new Map(profile.experience.map((e) => [e.id, e]));
  const proj = new Map(profile.projects.map((p) => [p.id, p]));

  return (
    <main className={pageClass}>
      <PageHeader
        title="CV Library"
        description={`Your role-specific CVs. Updated ${timeAgo(updated)} · ${total} application${total === 1 ? "" : "s"} submitted so far.`}
      />

      <p className="mb-6 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        These are your originals. Jackal never changes them: each application gets its own tailored copy, built only from facts in
        data/profile/profile.yaml. Edit that file to update a CV.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {profile.cvs.map((cv) => (
          <Card key={cv.id} className="flex flex-col">
            <div className="mb-3 flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-accent">
                <FileText className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{cv.label}</h2>
                <p className="text-[13px] text-muted">{cv.headline}</p>
              </div>
            </div>
            <p className="text-[13px]">{cv.summary}</p>

            <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-line py-3 text-center">
              <div>
                <dt className="text-xs text-muted">Experience</dt>
                <dd className="text-sm font-semibold tabular-nums">{cv.yearsOfExperience} yrs</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Used</dt>
                <dd className="text-sm font-semibold tabular-nums">{used(cv.id)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Submitted</dt>
                <dd className="text-sm font-semibold tabular-nums">{used(cv.id, "submitted")}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-muted">Includes</p>
              <ul className="space-y-0.5 text-[13px]">
                {cv.experienceIds.map((id) => exp.get(id)).filter(Boolean).map((e) => (
                  <li key={e!.id} className="truncate">
                    {e!.title} – {e!.company}
                  </li>
                ))}
                {cv.projectIds.map((id) => proj.get(id)).filter(Boolean).map((p) => (
                  <li key={p!.id} className="truncate text-muted">
                    Project: {p!.name.split(" – ")[0]}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {cv.skills.slice(0, 10).map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
              {cv.skills.length > 10 && <Badge>+{cv.skills.length - 10} more</Badge>}
            </div>

            <details className="group mt-auto pt-4">
              <summary className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-accent">
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Preview CV
              </summary>
              <div className="mt-3 rounded-lg border border-line bg-white p-4 text-black">
                <CvView cv={buildBaseCv(profile, cv.id)} />
              </div>
            </details>
          </Card>
        ))}
      </div>
    </main>
  );
}
