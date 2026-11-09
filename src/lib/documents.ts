// Standalone HTML for the CV and cover letter, rendered to PDF by Playwright (real text, so
// applicant tracking systems can read it). Kept independent of the Next.js app so the apply
// script can make PDFs without the dashboard running.

import type { CvDocument } from "./tailor";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BASE_CSS = `
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35; color: #000; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 2pt; text-align: center; }
  .headline, .contact { text-align: center; margin: 0; }
  .contact { font-size: 9.5pt; margin-bottom: 8pt; }
  h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: .5pt; border-bottom: 1px solid #000; margin: 10pt 0 4pt; padding-bottom: 1pt; }
  .row { display: flex; justify-content: space-between; gap: 8pt; font-weight: bold; }
  .row span:last-child { font-weight: normal; white-space: nowrap; }
  ul { margin: 2pt 0 6pt 16pt; padding: 0; }
  li { margin: 1pt 0; }
  .item { break-inside: avoid; }
  p { margin: 2pt 0; }
`;

export function cvToHtml(cv: CvDocument): string {
  const section = (title: string, body: string) => (body ? `<h2>${esc(title)}</h2>${body}` : "");
  const bullets = (items: { text: string }[]) => `<ul>${items.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(cv.name)}</title><style>${BASE_CSS}</style></head><body>
  <h1>${esc(cv.name)}</h1>
  <p class="headline">${esc(cv.headline)}</p>
  <p class="contact">${cv.contact.map(esc).join(" • ")}</p>
  ${section("Summary", `<p>${esc(cv.summary)}</p>${cv.focusLine ? `<p>${esc(cv.focusLine)}</p>` : ""}`)}
  ${section("Skills", `<p>${cv.skills.map(esc).join(" • ")}</p>`)}
  ${section(
    "Experience",
    cv.experience
      .map(
        (e) =>
          `<div class="item"><div class="row"><span>${esc(e.title)} – ${esc(e.company)}</span><span>${esc(e.dates)}</span></div>${bullets(e.bullets)}</div>`,
      )
      .join(""),
  )}
  ${section(
    "Projects",
    cv.projects
      .map(
        (p) =>
          `<div class="item"><div class="row"><span>${esc(p.name)}${p.stack.length ? ` <span style="font-weight:normal">| ${esc(p.stack.join(", "))}</span>` : ""}</span><span></span></div>${bullets(p.bullets)}</div>`,
      )
      .join(""),
  )}
  ${section(
    "Education",
    cv.education.map((e) => `<p>${esc(e.qualification)}, ${esc(e.institution)}${e.year ? ` (${esc(e.year)})` : ""}</p>`).join(""),
  )}
  ${
    cv.cvId === "data-annotation" && cv.certifications.length
      ? section("Training & Self-Study", `<ul>${cv.certifications.map((c) => `<li>${esc(c.replace(/^Self-study:\s*/, ""))}</li>`).join("")}</ul>`)
      : ""
  }
  </body></html>`;
}

export function coverLetterToHtml(name: string, text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cover letter - ${esc(name)}</title><style>${BASE_CSS} p { margin: 0 0 9pt; }</style></head><body>${paras}</body></html>`;
}

/** File-system safe base name, e.g. "Israel Abiodun Boluwatife - CV - Hivex". */
export function safeFileName(...parts: string[]): string {
  return parts
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
