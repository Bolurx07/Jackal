"use client";

// Navigation: a sidebar on desktop, and a top bar + bottom tab bar on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Briefcase, FileText, Inbox, LayoutDashboard, Send } from "lucide-react";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: Send },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/cvs", label: "CV Library", icon: FileText },
];

type IsActive = (href: string) => boolean;
const none: IsActive = () => false;

function useActive(): IsActive {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
}

// Reading the URL must happen inside <Suspense>; the fallback is the same nav without a highlight.
export function Sidebar() {
  return (
    <Suspense fallback={<SidebarView isActive={none} />}>
      <SidebarLive />
    </Suspense>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavView isActive={none} />}>
      <BottomNavLive />
    </Suspense>
  );
}

function SidebarLive() {
  return <SidebarView isActive={useActive()} />;
}

function BottomNavLive() {
  return <BottomNavView isActive={useActive()} />;
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-[13px] font-bold text-white">J</span>
      Jackal
    </Link>
  );
}

function SidebarView({ isActive }: { isActive: IsActive }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex print:hidden">
      <div className="px-2">
        <Logo />
      </div>
      <nav className="mt-8 flex flex-col gap-0.5" aria-label="Main">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary-soft text-accent" : "text-muted hover:bg-subtle hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-auto px-2.5 text-xs leading-relaxed text-muted">
        Searches daily at 10:00 WAT.
        <br />
        Nothing is submitted without you.
      </p>
    </aside>
  );
}

export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden print:hidden">
      <Logo />
    </header>
  );
}

function BottomNavView({ isActive }: { isActive: IsActive }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
              active ? "text-accent" : "text-muted",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            {label === "CV Library" ? "CVs" : label === "Applications" ? "Apply" : label}
          </Link>
        );
      })}
    </nav>
  );
}
