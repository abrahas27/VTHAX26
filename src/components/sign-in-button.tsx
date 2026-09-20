import { signIn, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * Server-action sign-in, so the landing page ships no client JavaScript for its primary action.
 * `/start` decides where to land (onboarding vs dashboard) once the session exists.
 */
export function SignInButton({ next = "/start" }: { next?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: next });
      }}
    >
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        <GoogleMark />
        Continue with Google
      </Button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.8l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.55-2.03-6.46-4.76H1.69v2.98A11.5 11.5 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.54 14.65a6.9 6.9 0 0 1 0-4.4V7.27H1.69a11.5 11.5 0 0 0 0 10.36l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.71 1.24 15.1 0 12 0 7.48 0 3.57 2.6 1.69 6.39l3.85 2.98C6.45 6.8 9 4.77 12 4.77Z"
      />
    </svg>
  );
}
