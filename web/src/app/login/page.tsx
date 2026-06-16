import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-4 text-sm text-muted-foreground">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
