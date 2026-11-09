import type { CvDocument } from "@/lib/tailor";

/**
 * ATS-friendly CV layout: single column, plain headings, real text (no images or tables).
 * `highlightSkills` marks skills that tailoring added.
 */
export function CvView({ cv, highlightSkills = [] }: { cv: CvDocument; highlightSkills?: string[] }) {
  const added = new Set(highlightSkills.map((s) => s.toLowerCase()));
  return (
    <article className="cv text-[13px] leading-snug">
      <header className="mb-3 text-center">
        <h1 className="text-xl font-bold">{cv.name}</h1>
        <p>{cv.headline}</p>
        <p className="text-[12px]">{cv.contact.join(" • ")}</p>
      </header>

      <Section title="Summary">
        <p>{cv.summary}</p>
        {cv.focusLine && <p className="mt-1">{cv.focusLine}</p>}
      </Section>

      <Section title="Skills">
        <p>
          {cv.skills.map((s, i) => (
            <span key={s}>
              {i > 0 && " • "}
              <span className={added.has(s.toLowerCase()) ? "cv-added rounded bg-green-100 px-0.5 dark:bg-green-900" : ""}>{s}</span>
            </span>
          ))}
        </p>
      </Section>

      {cv.experience.length > 0 && (
        <Section title="Experience">
          {cv.experience.map((e) => (
            <div key={e.id} className="mb-2 break-inside-avoid">
              <div className="flex justify-between gap-2 font-semibold">
                <span>
                  {e.title} – {e.company}
                </span>
                <span className="shrink-0 font-normal">{e.dates}</span>
              </div>
              <ul className="ml-5 list-disc">
                {e.bullets.map((b) => (
                  <li key={b.id}>{b.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {cv.projects.length > 0 && (
        <Section title="Projects">
          {cv.projects.map((p) => (
            <div key={p.id} className="mb-2 break-inside-avoid">
              <div className="font-semibold">
                {p.name}
                {p.stack.length > 0 && <span className="font-normal"> | {p.stack.join(", ")}</span>}
              </div>
              <ul className="ml-5 list-disc">
                {p.bullets.map((b) => (
                  <li key={b.id}>{b.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {cv.education.length > 0 && (
        <Section title="Education">
          {cv.education.map((e) => (
            <p key={e.institution}>
              {e.qualification}, {e.institution}
              {e.year ? ` (${e.year})` : ""}
            </p>
          ))}
        </Section>
      )}

      {cv.certifications.length > 0 && cv.cvId === "data-annotation" && (
        <Section title="Training & Self-Study">
          <ul className="ml-5 list-disc">
            {cv.certifications.map((c) => (
              <li key={c}>{c.replace(/^Self-study:\s*/, "")}</li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h2 className="mb-1 border-b border-current text-[13px] font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
