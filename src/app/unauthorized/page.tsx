// Shown for disallowed email domains and for non-admins hitting /admin (spec 5.6).
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Unauthorized() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl">Access denied</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        This HokiePath deployment is limited to approved accounts. If you think this is a mistake,
        try signing in with a different Google account.
      </p>
      <Button variant="secondary" nativeButton={false} render={<Link href="/" />}>
        Back to sign in
      </Button>
    </main>
  );
}
