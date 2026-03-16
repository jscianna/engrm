"use client";

import { use, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Save,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getSkillAction, updateSkillAction, submitSkillFeedbackAction } from "./actions";

interface SkillContent {
  whenToUse?: string;
  procedure?: string[];
  commonPitfalls?: string[];
  verification?: string;
}

interface SkillData {
  id: string;
  userId: string | null;
  scope: "local" | "global";
  patternId: string;
  patternKey: string;
  name: string;
  description: string;
  markdown: string;
  contentJson: string;
  qualityScore: number;
  usageCount: number;
  successRate: number;
  acceptedApplicationCount: number;
  successfulApplicationCount: number;
  medianTimeToResolutionMs: number | null;
  medianRetries: number | null;
  verificationPassRate: number;
  impactScore: number;
  promotionReason: string | null;
  status: string;
  published: boolean;
  publishedTo: string | null;
  clawHubId: string | null;
  sourceTraceCount: number;
  sourcePatternIdsJson: string;
  sourceTraceIdsJson: string;
  createdAt: string;
  updatedAt: string;
}

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (
    status.includes("deprecated") ||
    status.includes("failed") ||
    status === "stale"
  ) {
    return "destructive";
  }
  if (status.includes("candidate") || status.includes("draft")) {
    return "secondary";
  }
  return "default";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [skill, setSkill] = useState<SkillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [description, setDescription] = useState("");
  const [procedure, setProcedure] = useState("");
  const [pitfalls, setPitfalls] = useState("");
  const [whenToUse, setWhenToUse] = useState("");
  const [verification, setVerification] = useState("");
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Feedback state
  const [feedbackOutcome, setFeedbackOutcome] = useState<
    "success" | "failure" | null
  >(null);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Markdown collapsed
  const [markdownOpen, setMarkdownOpen] = useState(false);

  const [isSaving, startSaving] = useTransition();
  const [isSubmittingFeedback, startFeedback] = useTransition();

  useEffect(() => {
    async function load() {
      try {
        const data = await getSkillAction(id);
        if (!data) {
          setError("Skill not found.");
          return;
        }
        setSkill(data);
        const content = JSON.parse(data.contentJson) as SkillContent;
        setDescription(data.description ?? "");
        setProcedure((content.procedure ?? []).join("\n"));
        setPitfalls((content.commonPitfalls ?? []).join("\n"));
        setWhenToUse(content.whenToUse ?? "");
        setVerification(content.verification ?? "");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load skill",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  function handleSave() {
    if (!skill) return;
    const formData = new FormData();
    formData.set("skillId", skill.id);
    formData.set("description", description);
    formData.set("procedure", procedure);
    formData.set("pitfalls", pitfalls);
    formData.set("whenToUse", whenToUse);
    formData.set("verification", verification);

    startSaving(async () => {
      await updateSkillAction(formData);
      setSaveToast("Skill saved successfully.");
      setTimeout(() => setSaveToast(null), 3000);
    });
  }

  function handleFeedback() {
    if (!skill || !feedbackOutcome) return;
    const formData = new FormData();
    formData.set("skillId", skill.id);
    formData.set("patternId", skill.patternId);
    formData.set("outcome", feedbackOutcome);
    formData.set("notes", feedbackNotes);

    startFeedback(async () => {
      await submitSkillFeedbackAction(formData);
      setFeedbackToast(
        feedbackOutcome === "success"
          ? "Thanks! Feedback recorded as helpful."
          : "Thanks! Feedback recorded as not helpful.",
      );
      setFeedbackOutcome(null);
      setFeedbackNotes("");
      setTimeout(() => setFeedbackToast(null), 4000);
    });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/cognition"
          className="inline-flex items-center text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cognition
        </Link>
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
          {error ?? "Skill not found"}
        </div>
      </div>
    );
  }

  const content = JSON.parse(skill.contentJson) as SkillContent;
  const sourcePatternIds = JSON.parse(skill.sourcePatternIdsJson) as string[];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/cognition"
        className="inline-flex items-center text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Cognition
      </Link>

      {/* Header */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              <h1 className="text-2xl font-semibold text-zinc-100">
                {skill.name}
              </h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              {skill.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={statusVariant(skill.status)}>{skill.status}</Badge>
            <Badge variant="outline">{skill.scope}</Badge>
            {skill.published && (
              <Badge variant="outline" className="border-cyan-700 text-cyan-300">
                published
              </Badge>
            )}
          </div>
        </div>
      </section>

      {/* Impact Stats */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Success Rate</CardDescription>
            <CardTitle className="text-2xl font-mono text-cyan-400">
              {Math.round(skill.successRate * 100)}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Usage Count</CardDescription>
            <CardTitle className="text-2xl font-mono text-cyan-400">
              {skill.usageCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Verification Pass Rate</CardDescription>
            <CardTitle className="text-2xl font-mono text-cyan-400">
              {Math.round(skill.verificationPassRate * 100)}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Impact Score</CardDescription>
            <CardTitle className="text-2xl font-mono text-cyan-400">
              {skill.impactScore.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {/* Skill Content */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Skill Content</CardTitle>
          <CardDescription>
            Structured knowledge extracted from your learning traces.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {content.whenToUse && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                When to Use
              </p>
              <p className="text-sm text-zinc-300">{content.whenToUse}</p>
            </div>
          )}

          {content.procedure && content.procedure.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Procedure
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-300">
                {content.procedure.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {content.commonPitfalls && content.commonPitfalls.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Common Pitfalls
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
                {content.commonPitfalls.map((pitfall, i) => (
                  <li key={i}>{pitfall}</li>
                ))}
              </ul>
            </div>
          )}

          {content.verification && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Verification
              </p>
              <p className="text-sm text-zinc-300">{content.verification}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Skill */}
      {skill.scope === "local" && (
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Edit Skill</CardTitle>
            <CardDescription>
              Refine this skill&apos;s description and structured content. Your edits will be used on the next retrieval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {saveToast && (
              <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                {saveToast}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Approach / Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="border-zinc-700 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder="Describe when and how to apply this skill…"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                When to Use
              </label>
              <Textarea
                value={whenToUse}
                onChange={(e) => setWhenToUse(e.target.value)}
                rows={2}
                className="border-zinc-700 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder="Describe the triggering conditions…"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Procedure Steps{" "}
                <span className="text-zinc-600">(one per line)</span>
              </label>
              <Textarea
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                rows={5}
                className="border-zinc-700 bg-zinc-950 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder={"Step 1\nStep 2\nStep 3"}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Common Pitfalls{" "}
                <span className="text-zinc-600">(one per line)</span>
              </label>
              <Textarea
                value={pitfalls}
                onChange={(e) => setPitfalls(e.target.value)}
                rows={3}
                className="border-zinc-700 bg-zinc-950 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder={"Pitfall 1\nPitfall 2"}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Verification
              </label>
              <Textarea
                value={verification}
                onChange={(e) => setVerification(e.target.value)}
                rows={2}
                className="border-zinc-700 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder="How to verify the skill was applied correctly…"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Manual Feedback */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Manual Feedback</CardTitle>
          <CardDescription>
            Did this skill help you solve a problem? Your signal improves future
            retrievals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedbackToast && (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              {feedbackToast}
            </div>
          )}

          <div>
            <p className="mb-3 text-sm text-zinc-400">Did this skill help?</p>
            <div className="flex gap-3">
              <Button
                variant={feedbackOutcome === "success" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFeedbackOutcome(
                    feedbackOutcome === "success" ? null : "success",
                  )
                }
                className={
                  feedbackOutcome === "success"
                    ? "bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-600"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                }
              >
                <ThumbsUp className="mr-2 h-4 w-4" />
                Yes, it helped
              </Button>
              <Button
                variant={feedbackOutcome === "failure" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFeedbackOutcome(
                    feedbackOutcome === "failure" ? null : "failure",
                  )
                }
                className={
                  feedbackOutcome === "failure"
                    ? "bg-rose-700 text-white hover:bg-rose-600 border-rose-700"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                }
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                No, it didn&apos;t
              </Button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Notes <span className="text-zinc-600">(optional)</span>
            </label>
            <Textarea
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              rows={2}
              placeholder="What worked or didn't work?"
              className="border-zinc-700 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>

          <Button
            onClick={handleFeedback}
            disabled={!feedbackOutcome || isSubmittingFeedback}
            className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            {isSubmittingFeedback ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Submit Feedback
          </Button>
        </CardContent>
      </Card>

      {/* Source Info */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Source Info</CardTitle>
          <CardDescription>
            Origin traces, pattern linkage, and lifecycle metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-500">Source Traces</p>
              <p className="mt-1 text-lg font-mono text-zinc-100">
                {skill.sourceTraceCount}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-500">Pattern ID</p>
              <p className="mt-1 font-mono text-xs text-cyan-400 break-all">
                {skill.patternId}
              </p>
            </div>
            {sourcePatternIds.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 sm:col-span-2">
                <p className="text-xs text-zinc-500">Source Pattern IDs</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {sourcePatternIds.map((pid) => (
                    <span
                      key={pid}
                      className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-400"
                    >
                      {pid}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-500">Created</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-300">
                <Clock className="h-3 w-3 text-zinc-500" />
                {formatDate(skill.createdAt)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-500">Last Updated</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-300">
                <Clock className="h-3 w-3 text-zinc-500" />
                {formatDate(skill.updatedAt)}
              </p>
            </div>
          </div>

          {/* Collapsible markdown preview */}
          {skill.markdown && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50">
              <button
                type="button"
                onClick={() => setMarkdownOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                <span>Full Markdown Preview</span>
                {markdownOpen ? (
                  <ChevronUp className="h-4 w-4 text-zinc-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                )}
              </button>
              {markdownOpen && (
                <div className="border-t border-zinc-800 px-4 py-4">
                  <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-400 leading-relaxed">
                    {skill.markdown}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
