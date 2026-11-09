import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jackal",
  description: "Personal job search agent",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="print:hidden border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-5 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">
              Jackal
            </Link>
            <Link href="/" className="text-zinc-600 hover:text-foreground dark:text-zinc-400">
              Jobs
            </Link>
            <Link href="/applications" className="text-zinc-600 hover:text-foreground dark:text-zinc-400">
              Applications
            </Link>
            <Link href="/inbox" className="text-zinc-600 hover:text-foreground dark:text-zinc-400">
              Inbox
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
