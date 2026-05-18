"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Post = Record<string, unknown>;

const PREVIEW_LENGTH = 160;

function platformBadgeClass(platform: string) {
  if (platform === "facebook") return "bg-blue-600/15 text-blue-400 border-blue-600/30";
  if (platform === "linkedin") return "bg-sky-600/15 text-sky-400 border-sky-600/30";
  return "";
}

function PostCard({
  post,
  businesses,
  mode,
  onRefresh,
}: {
  post: Post;
  businesses: Post[];
  mode: "pending" | "approved" | "published";
  onRefresh: () => Promise<void>;
}) {
  const id = String(post.id);
  const brand = String(businesses.find((b) => String(b.id) === String(post.business_id))?.name ?? "Unknown");
  const platform = String(post.platform ?? "");
  const [draft, setDraft] = useState(String(post.content ?? ""));
  const [expanded, setExpanded] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const v = post.scheduled_at as string | null | undefined;
    if (!v) return "";
    return v.slice(0, 16);
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const preview = draft.length > PREVIEW_LENGTH ? draft.slice(0, PREVIEW_LENGTH).trimEnd() + "…" : draft;

  const saveDraft = async () => {
    if (!draft.trim()) { toast.error("Post cannot be empty"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { id, content: draft.trim() };
      if (scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
      else body.scheduled_at = null;
      const res = await fetch("/api/pending-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        toast.error(typeof d.error === "string" ? d.error : "Could not save edits");
        return;
      }
      toast.success("Draft saved");
      await onRefresh();
    } finally { setSaving(false); }
  };

  const setStatus = async (status: "approved" | "rejected") => {
    if (!draft.trim()) { toast.error("Add copy before changing status"); return; }
    const body: Record<string, unknown> = { id, status, content: draft.trim() };
    if (scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
    const res = await fetch("/api/pending-posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as Record<string, unknown>;
      toast.error(typeof d.error === "string" ? d.error : "Could not update status");
      return;
    }
    toast.success(status === "approved" ? "Approved ✓" : "Rejected");
    await onRefresh();
  };

  const deletePost = async () => {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/pending-posts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        toast.error(typeof d.error === "string" ? d.error : "Could not delete post");
        return;
      }
      toast.success("Post deleted");
      await onRefresh();
    } finally { setDeleting(false); }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast.success("Copied — paste into Facebook or LinkedIn");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  };

  const publishNow = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/publish-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        const hint = typeof data.hint === "string" ? `\n${data.hint}` : "";
        toast.error(`${typeof data.error === "string" ? data.error : "Publish failed"}${hint}`, { duration: 12000 });
        return;
      }
      const note =
        typeof data.note === "string"
          ? data.note
          : typeof data.facebook_post_id === "string"
            ? `Published to Facebook (${data.facebook_post_id})`
            : typeof data.linkedin_post_urn === "string"
              ? "Published to LinkedIn"
              : "Marked published";
      toast.success(note, { duration: 8000 });
      await onRefresh();
    } finally { setPublishing(false); }
  };

  const schedAt = post.scheduled_at as string | null | undefined;
  const isExpandable = draft.length > PREVIEW_LENGTH || mode === "pending";

  return (
    <Card className="border border-border/80 shadow-sm" data-testid="pending-post-card" data-post-id={id}>
      {/* ── Header — always visible ───────────────────────────── */}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-semibold">{brand}</CardTitle>
              <Badge variant="outline" className={`text-[10px] ${platformBadgeClass(platform)}`}>
                {platform}
              </Badge>
              {mode === "approved" && (
                <Badge className="rounded-full border border-emerald-600/30 bg-emerald-600/15 text-[10px] text-emerald-400">
                  Approved
                </Badge>
              )}
            </div>
            {schedAt && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Scheduled: {new Date(schedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Copy / Delete / Expand controls */}
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => void copyToClipboard()}
              aria-label="Copy post content"
              title="Copy to clipboard"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            {mode !== "published" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                disabled={deleting}
                onClick={() => void deletePost()}
                aria-label="Delete post"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {isExpandable && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Collapse post" : "Expand post"}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Preview — shown when collapsed */}
        {!expanded && (
          <p
            className="mt-2 cursor-pointer text-xs leading-relaxed text-muted-foreground"
            onClick={() => setExpanded(true)}
          >
            {preview}
            {draft.length > PREVIEW_LENGTH && (
              <span className="ml-1 text-primary underline-offset-2 hover:underline">more</span>
            )}
          </p>
        )}
      </CardHeader>

      {/* ── Expanded body ─────────────────────────────────────── */}
      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {mode === "published" ? (
            <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2.5 text-xs leading-relaxed">
              {draft}
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`post-edit-${id}`} className="text-xs">
                  {mode === "approved" ? "Copy (tap Save to re-queue for editing)" : "Edit copy"}
                </Label>
                <Textarea
                  id={`post-edit-${id}`}
                  aria-label={`Edit post for ${brand}`}
                  rows={6}
                  className="min-h-[120px] resize-y text-xs leading-relaxed"
                  value={draft}
                  readOnly={mode === "approved"}
                  onChange={mode === "pending" ? (e) => setDraft(e.target.value) : undefined}
                />
              </div>

              {mode === "pending" && (
                <div className="space-y-1.5">
                  <Label htmlFor={`sched-${id}`} className="text-xs">Schedule (optional)</Label>
                  <Input
                    id={`sched-${id}`}
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {mode === "pending" && (
                  <>
                    <Button type="button" variant="secondary" className="h-10 w-full text-xs sm:flex-1" disabled={saving} onClick={saveDraft}>
                      {saving ? "Saving…" : "Save edits"}
                    </Button>
                    <Button
                      type="button"
                      className="h-10 w-full bg-emerald-600 text-xs text-white hover:bg-emerald-500 sm:flex-1"
                      onClick={() => void setStatus("approved")}
                    >
                      Approve
                    </Button>
                    <Button type="button" variant="destructive" className="h-10 w-full text-xs sm:flex-1" onClick={() => void setStatus("rejected")}>
                      Reject
                    </Button>
                  </>
                )}
                {mode === "approved" && (
                  <Button
                    type="button"
                    className="h-10 w-full bg-blue-600 text-xs text-white hover:bg-blue-500"
                    disabled={publishing}
                    onClick={() => void publishNow()}
                  >
                    {publishing ? "Publishing…" : `Publish to ${platform}`}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function ApprovalsScreen() {
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [approvedPosts, setApprovedPosts] = useState<Post[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<Post[]>([]);
  const [businesses, setBusinesses] = useState<Post[]>([]);
  const [biz, setBiz] = useState<string>("all");

  const load = async () => {
    const [pending, approved, published, b] = await Promise.all([
      fetch("/api/pending-posts?status=pending"),
      fetch("/api/pending-posts?status=approved"),
      fetch("/api/pending-posts?status=published"),
      fetch("/api/businesses"),
    ]);
    if (pending.ok) setPendingPosts(await pending.json());
    if (approved.ok) setApprovedPosts(await approved.json());
    if (published.ok) setPublishedPosts(await published.json());
    if (b.ok) setBusinesses(await b.json());
  };

  useEffect(() => { void load(); }, []);

  const filter = (posts: Post[]) =>
    biz === "all" ? posts : posts.filter((p) => String(p.business_id) === biz);

  const pending = filter(pendingPosts);
  const approved = filter(approvedPosts);
  const published = filter(publishedPosts);

  const empty = (label: string) => (
    <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>
  );

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-3">
        <Select value={biz} onValueChange={(v) => setBiz(typeof v === "string" ? v : "all")}>
          <SelectTrigger className="h-9 flex-1 text-sm md:max-w-64">
            <SelectValue placeholder="All brands" />
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
        <span className="shrink-0 text-xs text-muted-foreground">
          {pending.length}p · {approved.length}a · {published.length}pub
        </span>
      </div>

      <Tabs defaultValue="pending" className="min-w-0">
        <TabsList className="grid w-full grid-cols-3 md:inline-flex">
          <TabsTrigger value="pending" className="gap-1 text-xs sm:text-sm">
            Pending
            {pending.length > 0 && (
              <span className="hidden min-w-[1.25rem] rounded-full bg-primary/20 px-1 text-center text-[10px] leading-tight sm:inline-block">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1 text-xs sm:text-sm">
            Approved
            {approved.length > 0 && (
              <span className="hidden min-w-[1.25rem] rounded-full bg-emerald-600/20 px-1 text-center text-[10px] leading-tight sm:inline-block">
                {approved.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="published" className="text-xs sm:text-sm">Published</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-3 space-y-2">
          {pending.length
            ? pending.map((p) => (
                <PostCard key={String(p.id)} post={p} businesses={businesses} mode="pending" onRefresh={load} />
              ))
            : empty("Nothing waiting — the engine will queue drafts on the next run.")}
        </TabsContent>

        <TabsContent value="approved" className="mt-3 space-y-2">
          {approved.length
            ? approved.map((p) => (
                <PostCard key={String(p.id)} post={p} businesses={businesses} mode="approved" onRefresh={load} />
              ))
            : empty("No approved posts — approve items from the Pending tab first.")}
        </TabsContent>

        <TabsContent value="published" className="mt-3 space-y-2">
          {published.length
            ? published.map((p) => (
                <PostCard key={String(p.id)} post={p} businesses={businesses} mode="published" onRefresh={load} />
              ))
            : empty("No published posts yet.")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
