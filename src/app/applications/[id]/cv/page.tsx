import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { applications, jobs } from "@/db/schema";
import { CvView } from "@/components/cv-view";
import { PrintButton } from "@/components/print-button";
import { cx, pageClass } from "@/components/ui";

export default function CvPrintPage({ params }: PageProps<"/applications/[id]/cv">) {
  return (
    <Suspense fallback={<main className={cx(pageClass, "text-muted")}>Loading…</main>}>
      <PrintableCv params={params} />
    </Suspense>
  );
}

async function PrintableCv({ params }: { params: PageProps<"/applications/[id]/cv">["params"] }) {
  await connection(); // render per request (shows live times)
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
    <main className={cx(pageClass, "print:max-w-none print:p-0")}>
      <div className="mx-auto max-w-[210mm] print:hidden">
        <Link href={`/applications/${appId}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back to application
        </Link>
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted">
            In the print dialog, choose <b className="text-foreground">Save as PDF</b>. Suggested file name:{" "}
            <span className="break-all text-foreground">{fileName}.pdf</span>
          </p>
          <PrintButton />
        </div>
      </div>
      {/* The page itself: always black on white, like the PDF */}
      <div className="mx-auto max-w-[210mm] overflow-x-auto rounded-lg border border-line bg-white px-6 py-8 text-black sm:px-10 print:overflow-visible print:rounded-none print:border-0 print:p-0">
        <CvView cv={row.app.tailoredCv} />
      </div>
    </main>
  );
}
