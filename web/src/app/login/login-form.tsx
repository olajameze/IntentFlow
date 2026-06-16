"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const signInPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) {
      toast.error("Enter your email");
      return;
    }
    setLoading(true);
    try {
      const sb = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setMagicSent(true);
      toast.success("Check your email for the sign-in link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>IntentFlow operator login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {magicSent ? (
            <p className="text-sm text-muted-foreground">
              Magic link sent to <strong>{email}</strong>. Open the link in this browser to continue.
            </p>
          ) : (
            <>
              <form className="space-y-3" onSubmit={signInPassword}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in with password"}
                </Button>
              </form>
              <div className="relative text-center text-xs text-muted-foreground">
                <span className="bg-card px-2">or</span>
              </div>
              <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => void sendMagicLink()}>
                Send magic link
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
