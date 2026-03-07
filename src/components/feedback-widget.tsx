"use client";

import { useState } from "react";
import { MessageSquare, X, Send, Loader2, ThumbsUp, ThumbsDown, Bug, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type FeedbackType = "bug" | "feature" | "general" | "praise";

const FEEDBACK_TYPES: { type: FeedbackType; icon: React.ElementType; label: string; color: string }[] = [
  { type: "bug", icon: Bug, label: "Bug Report", color: "text-rose-400" },
  { type: "feature", icon: Lightbulb, label: "Feature Request", color: "text-amber-400" },
  { type: "praise", icon: ThumbsUp, label: "What I Love", color: "text-emerald-400" },
  { type: "general", icon: MessageSquare, label: "General", color: "text-cyan-400" },
];

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("general");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter your feedback");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          message: message.trim(),
          email: email.trim() || undefined,
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to send feedback");
      }

      toast.success("Thank you for your feedback! 💜");
      setMessage("");
      setEmail("");
      setIsOpen(false);
    } catch {
      toast.error("Failed to send feedback. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500 text-black shadow-lg transition-transform hover:scale-110 hover:bg-cyan-400 md:bottom-8 md:right-8"
        title="Send Feedback"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Feedback Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-zinc-900 p-6 shadow-2xl sm:rounded-2xl sm:m-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-100">Send Feedback</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Feedback Type Selection */}
              <div className="grid grid-cols-2 gap-2">
                {FEEDBACK_TYPES.map(({ type, icon: Icon, label, color }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFeedbackType(type)}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                      feedbackType === type
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className="text-zinc-200">{label}</span>
                  </button>
                ))}
              </div>

              {/* Message */}
              <div>
                <textarea
                  placeholder="Tell us what's on your mind..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Email (optional) */}
              <div>
                <input
                  type="email"
                  placeholder="Email (optional, for follow-up)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={sending || !message.trim()}
                className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Feedback
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-zinc-500">
              Your feedback helps us improve FatHippo
            </p>
          </div>
        </div>
      )}
    </>
  );
}
