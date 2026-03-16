"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSkillById, updateSkillFields, updatePatternFeedback } from "@/lib/cognitive-db";
import { enforceRequestThrottle } from "@/lib/request-throttle";

export async function getSkillAction(skillId: string) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const skill = await getSkillById(userId, skillId);
  return skill;
}

export async function updateSkillAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  await enforceRequestThrottle({
    scope: "dashboard.cognitive.skill.update",
    actorKey: userId.toLowerCase(),
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });

  const skillId = String(formData.get("skillId") ?? "");
  const description = String(formData.get("description") ?? "");
  const procedureRaw = String(formData.get("procedure") ?? "");
  const pitfallsRaw = String(formData.get("pitfalls") ?? "");
  const whenToUse = String(formData.get("whenToUse") ?? "");
  const verification = String(formData.get("verification") ?? "");

  const procedure = procedureRaw.split("\n").map((s) => s.trim()).filter(Boolean);
  const commonPitfalls = pitfallsRaw.split("\n").map((s) => s.trim()).filter(Boolean);

  const content = { whenToUse, procedure, commonPitfalls, verification };

  await updateSkillFields({
    userId,
    skillId,
    description,
    contentJson: JSON.stringify(content),
  });

  revalidatePath(`/dashboard/cognition/skills/${skillId}`);
  revalidatePath("/dashboard/cognition");
}

export async function submitSkillFeedbackAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  await enforceRequestThrottle({
    scope: "dashboard.cognitive.skill.feedback",
    actorKey: userId.toLowerCase(),
    limit: 50,
    windowMs: 60 * 60 * 1000,
  });

  const patternId = String(formData.get("patternId") ?? "");
  const skillId = String(formData.get("skillId") ?? "");
  const outcome = String(formData.get("outcome") ?? "") as "success" | "failure";
  const notes = String(formData.get("notes") ?? "") || null;

  if (!patternId || !skillId || !["success", "failure"].includes(outcome)) {
    return;
  }

  // Fetch the skill to find a valid source trace ID (required by updatePatternFeedback)
  const skill = await getSkillById(userId, skillId);
  const sourceTraceIds = skill ? (JSON.parse(skill.sourceTraceIdsJson) as string[]) : [];
  const traceId = sourceTraceIds[0] ?? "";

  if (!traceId) {
    // No source trace available; feedback can't be linked but we still return gracefully
    return;
  }

  await updatePatternFeedback({
    userId,
    patternId,
    traceId,
    outcome,
    notes,
  });

  revalidatePath(`/dashboard/cognition/skills/${skillId}`);
  revalidatePath("/dashboard/cognition");
}
