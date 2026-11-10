"use client";

// Form button with a loading state. With several buttons in one form, only the one that was
// clicked shows the spinner (matched by its formAction). Don't give a formAction button its own
// name/value: React uses the name for the server action's ID.
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingText,
  className,
  formAction,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending, action } = useFormStatus();
  const mine = pending && (!formAction || action === formAction);
  return (
    <button type="submit" formAction={formAction} disabled={pending} className={className} aria-busy={mine}>
      {mine && (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {mine && pendingText ? pendingText : children}
    </button>
  );
}
