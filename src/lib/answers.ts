import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const AnswerBank = z.object({
  answers: z.array(
    z.object({
      key: z.string(),
      question: z.string(),
      answer: z.string().nullable().default(""),
    }),
  ),
});

export interface PreparedAnswer {
  key: string;
  question: string;
  /** null = not in your answer bank; you need to answer it yourself. */
  answer: string | null;
}

export const ANSWERS_PATH = path.join(process.cwd(), "data", "profile", "answers.yaml");

export function loadAnswers(): PreparedAnswer[] {
  if (!existsSync(ANSWERS_PATH)) return [];
  const bank = AnswerBank.parse(parse(readFileSync(ANSWERS_PATH, "utf8")));
  return bank.answers.map((a) => ({
    key: a.key,
    question: a.question,
    answer: a.answer && a.answer.trim() ? a.answer.trim() : null,
  }));
}
