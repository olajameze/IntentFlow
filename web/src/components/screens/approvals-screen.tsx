"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function ApprovalsScreen() {
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
  const [businesses, setBusinesses] = useState<Record<string, unknown>[]>([]);
  const [biz, setBiz] = useState<string>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    const [p, b] = await Promise.all([fetch("/api/pending-posts?status=pending"), fetch("/api/businesses")]);
    if (p.ok) setPosts(await p.json());
    if (b.ok) setBusinesses(await b.json());
  };

  useEffect(() => {
    void load();
  }, []);

  const textFor = (post: Record<string, unknown>) => {
    const id = String(post.id);
    return drafts[id] ?? String(post.content ?? "");
  };

  const saveDraft = async (post: Record<string, unknown>) => {
    const id = String(post.id);
    const text = textFor(post).trim();
    if (!text) {
      toast.error("Post cannot be empty");
      return;
    }
    setSavingId(id);
    try {
      const res = await fetch("/api/pending-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data?.error === "string" ? data.error : "Could not save edits");
        return;
      }
      toast.success("Draft saved");
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const setStatus = async (post: Record<string, unknown>, status: "approved" | "rejected") => {
    const id = String(post.id);
    const text = textFor(post).trim();
    if (!text) {
      toast.error("Add copy before changing status");
      return;
    }
    const res = await fetch("/api/pending-posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, content: text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data?.error === "string" ? data.error : "Could not update status");
      return;
    }
    toast.success(status === "approved" ? "Approved" : "Rejected");
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    await load();
  };

  const publish = async (id: string) => {
    const res = await fetch("/api/publish-approved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      toast.error("Publish failed");
      return;
    }
    const data = await res.json().catch(() => ({}));
    const note = typeof data.note === "string" ? data.note : null;
    toast.success(note ?? (typeof data.facebook_post_id === "string" ? "Published to Facebook" : "Marked published"));
    await load();
  };

  const filtered = biz === "all" ? posts : posts.filter((p) => String(p.business_id) === biz);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Select value={biz} onValueChange={(v) => setBiz(typeof v === "string" ? v : "all")}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="Filter business" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={String(b.id)} value={String(b.id)}>
                {String(b.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} waiting</p>
      </div>

      <div className="grid gap-4">
        {filtered.map((post) => {
          const brand = String(businesses.find((b) => String(b.id) === String(post.business_id))?.name ?? "Unknown");
          const id = String(post.id);
          return (
            <Card
              key={id}
              className="border border-border/80 shadow-sm"
              data-testid="pending-post-card"
              data-post-id={id}
            >
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{brand}</CardTitle>
                  <Badge variant="secondary" className="rounded-full">
                    {String(post.platform)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {post.scheduled_at ? new Date(String(post.scheduled_at)).toLocaleString() : "Immediate"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`post-edit-${id}`}>Edit before approve</Label>
                  <Textarea
                    id={`post-edit-${id}`}
                    aria-label={`Edit post for ${brand}`}
                    rows={10}
                    className="min-h-[180px] resize-y text-sm leading-relaxed"
                    value={textFor(post)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-12 flex-1"
                    disabled={savingId === id}
                    onClick={() => void saveDraft(post)}
                  >
                    {savingId === id ? "Saving…" : "Save edits"}
                  </Button>
                  <Button
                    type="button"
                    className="h-12 flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => void setStatus(post, "approved")}
                  >
                    Approve
                  </Button>
                  <Button type="button" variant="destructive" className="h-12 flex-1" onClick={() => void setStatus(post, "rejected")}>
                    Reject
                  </Button>
                  <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => void publish(id)}>
                    Publish approved
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!filtered.length ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nothing waiting — agents will queue drafts according to your schedule.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
