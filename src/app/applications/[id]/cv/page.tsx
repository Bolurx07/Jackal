import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobs } from "@/db/schema";
import { CvView } from "@/components/cv-view";
import { PrintButton } from "@/components/print-button";

export default function CvPrintPage({ params }: PageProps<"/applications/[id]/cv">) {
  return (
    <Suspense fallback={<main className="p-8 text-zinc-500">Loading…</main>}>
      <PrintableCv params={params} />
    </Suspense>
  );
}

async function PrintableCv({ params }: { params: PageProps<"/applications/[id]/cv">["params"] }) {
  const { id } = await params;
  const appId = Number(id);
  if (!Number.isInteger(appId)) notFound();
  const [row] = await db
    .select({ app: applications, job: jobs })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.id, appId))
    .limit(1);
  if (!row) notFound();

  const fileName = `${row.app.tailoredCv.name} - ${row.job.title} - ${row.job.company}`.replace(/[\\/:*?"<>|]/g, "");

  return (
    <main className="cv-page mx-auto w-full max-w-[210mm] bg-white px-10 py-8 text-black print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 rounded border border-zinc-300 bg-zinc-50 p-3 text-sm print:hidden">
        <span>
          In the print dialog choose <b>Save as PDF</b>. Suggested file name: <b>{fileName}.pdf</b>
        </span>
        <PrintButton />
      </div>
      <CvView cv={row.app.tailoredCv} />
    </main>
  );
}
