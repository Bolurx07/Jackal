"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="shrink-0 rounded bg-black px-3 py-1.5 text-white">
      Print / Save as PDF
    </button>
  );
}
