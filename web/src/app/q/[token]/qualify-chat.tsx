"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./qualify-chat.module.css";

const DEFAULT_ACCENT = "#2F855A";

type TranscriptEntry = {
  role: "assistant" | "user";
  content: string;
  at?: string;
};

type SessionState = {
  campaign: string;
  brand_name: string;
  accent: string;
  prospect_name: string;
  opening_script: string;
  booking_url: string;
  transcript: TranscriptEntry[];
  done: boolean;
  outcome: string | null;
};

export function QualifyChat({ token }: { token: string }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/outreach-qualify/session?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      setError("This link is invalid or has expired.");
      return;
    }
    const data = (await res.json()) as SessionState;
    setSession(data);
    setDone(data.done);
    if (data.done) setBookingUrl(data.booking_url);

    const existing = data.transcript ?? [];
    if (existing.length) {
      setMessages(existing);
    } else if (data.opening_script) {
      setMessages([{ role: "assistant", content: data.opening_script }]);
    }
  }, [token]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const accent = session?.accent || DEFAULT_ACCENT;

  useEffect(() => {
    mainRef.current?.style.setProperty("--qualify-accent", accent);
  }, [accent]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || done) return;

    setInput("");
    setLoading(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await fetch("/api/outreach-qualify/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.done) {
        setDone(true);
        setBookingUrl(data.booking_url || session?.booking_url || null);
      }
    } catch {
      setError("Could not send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (error && !session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      </main>
    );
  }

  return (
    <main ref={mainRef} className="mx-auto flex min-h-screen max-w-lg flex-col p-4 pb-8">
      <header className={cn("mb-4 rounded-lg border p-4", styles.header)}>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Quick qualification</p>
        <h1 className="text-lg font-semibold">{session?.brand_name || "Loading…"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hi {session?.prospect_name || "there"} — a few short questions so we can point you to the right next step.
        </p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border bg-card p-3">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto bg-muted text-foreground"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading ? (
          <p className="text-xs text-muted-foreground">Thinking…</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {done && bookingUrl ? (
        <div className="mt-4 rounded-lg border p-4 text-center">
          <p className="mb-3 text-sm">You are all set — use the link below to continue.</p>
          <Button asChild className={styles.ctaButton}>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              Continue to booking
            </a>
          </Button>
        </div>
      ) : (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your reply…"
            disabled={loading || done || !session}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            aria-label="Your message"
          />
          <Button type="submit" disabled={loading || done || !input.trim() || !session}>
            Send
          </Button>
        </form>
      )}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </main>
  );
}
