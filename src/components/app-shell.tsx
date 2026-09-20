import Link from "next/link";
import { SignOutButton } from "@/components/sign-in-button";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/saved", label: "Saved" },
  { href: "/profile", label: "Profile" },
];

/** Sidebar + content frame used by every signed-in page (spec Figure 5.3). */
export function AppShell({
  children,
  isAdmin = false,
  greeting,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  greeting?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
      <aside className="lg:w-44 lg:shrink-0">
        <div className="flex items-center justify-between gap-4 lg:block">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            HokiePath
          </Link>
          <nav className="flex gap-1 overflow-x-auto lg:mt-6 lg:flex-col lg:gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors"
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors"
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="lg:mt-6">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {greeting && <p className="text-muted-foreground mb-4 text-sm lg:hidden">{greeting}</p>}
        {children}
      </main>
    </div>
  );
}
