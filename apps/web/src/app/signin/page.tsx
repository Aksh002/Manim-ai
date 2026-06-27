import Link from "next/link";
import { signIn } from "@/auth";

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const hasGitHub = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
const localDevEnabled = process.env.AUTH_REQUIRED !== "true";

export default function SignInPage() {
  return (
    <main className="signin-shell">
      <section className="signin-panel">
        <p className="eyebrow">Account</p>
        <h1>Sign in to Manim Studio</h1>
        <p className="muted">
          Use an OAuth provider in production. Local development can continue with the built-in dev user.
        </p>

        <div className="signin-actions">
          {hasGoogle ? (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button type="submit">Continue with Google</button>
            </form>
          ) : null}

          {hasGitHub ? (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/" });
              }}
            >
              <button type="submit">Continue with GitHub</button>
            </form>
          ) : null}

          {!hasGoogle && !hasGitHub ? (
            <div className="signin-dev-note">
              <strong>No OAuth providers are configured.</strong>
              <p>
                Because `AUTH_REQUIRED=false`, the app will use the local dev user automatically.
              </p>
            </div>
          ) : null}
        </div>

        <Link className="signin-return" href="/">
          Return to workspace
        </Link>

        {localDevEnabled ? <p className="muted compact">Local dev fallback is enabled.</p> : null}
      </section>
    </main>
  );
}
