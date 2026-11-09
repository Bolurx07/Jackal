import { createHash } from "node:crypto";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

/** Decode common HTML entities (Greenhouse returns escaped HTML). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|nbsp|#39|#x27);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Convert an HTML job description into readable plain text. */
export function htmlToText(html: string): string {
  return decodeEntities(decodeEntities(html))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|ltd|llc|limited|plc|gmbh)\b/g, "")
    .trim();
}

/** Same company + title + location => same job, even across different boards. */
export function fingerprint(company: string, title: string, location: string): string {
  return createHash("sha256")
    .update(`${normalize(company)}|${normalize(title)}|${normalize(location)}`)
    .digest("hex");
}
