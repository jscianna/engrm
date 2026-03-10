"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logAuditEvent } from "@/lib/audit-log";
import { assertSkillPublicationEnabled } from "@/lib/cognitive-guards";
import {
  deleteCognitiveUserData,
  publishSkill,
  refreshSkillDraftById,
  setPatternStatus,
  setSkillPublicationDisabled,
  updateCognitiveUserSettings,
} from "@/lib/cognitive-db";

async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
}

function redirectWithMessage(target: string, key: "notice" | "error", value: string): never {
  const searchParams = new URLSearchParams({ [key]: value });
  redirect(`${target}?${searchParams.toString()}`);
}

export async function deprecatePatternAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  const patternId = String(formData.get("patternId") ?? "");
  if (!patternId) {
    return;
  }
  await setPatternStatus({
    userId,
    patternId,
    status: "deprecated",
  });
  revalidatePath("/dashboard/cognitive");
}

export async function refreshSkillAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  const skillId = String(formData.get("skillId") ?? "");
  if (!skillId) {
    return;
  }
  await refreshSkillDraftById({ userId, skillId });
  revalidatePath("/dashboard/cognitive");
}

export async function disablePublishAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  const skillId = String(formData.get("skillId") ?? "");
  if (!skillId) {
    return;
  }
  await setSkillPublicationDisabled({ userId, skillId });
  revalidatePath("/dashboard/cognitive");
}

export async function publishSkillAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  assertSkillPublicationEnabled();
  const skillId = String(formData.get("skillId") ?? "");
  if (!skillId) {
    return;
  }
  const skill = await publishSkill({
    userId,
    skillId,
    allowGlobal: false,
    publishedTo: "clawhub",
  });
  if (skill) {
    await logAuditEvent({
      userId,
      action: "cognitive.skill.publish",
      resourceType: "cognitive_skill",
      resourceId: skill.id,
      metadata: {
        scope: skill.scope,
        publishedTo: skill.publishedTo,
      },
    });
  }
  revalidatePath("/dashboard/cognitive");
}

export async function updatePrivacySettingsAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  try {
    const sharedLearningEnabled = String(formData.get("sharedLearningEnabled") ?? "") === "on";
    const benchmarkInclusionEnabled = String(formData.get("benchmarkInclusionEnabled") ?? "") === "on";
    const traceRetentionDays = Number(formData.get("traceRetentionDays") ?? 30);
    const settings = await updateCognitiveUserSettings({
      userId,
      sharedLearningEnabled,
      benchmarkInclusionEnabled,
      traceRetentionDays,
    });
    await logAuditEvent({
      userId,
      action: "cognitive.settings.update",
      resourceType: "cognitive_settings",
      resourceId: userId,
      metadata: { ...settings },
    });
    revalidatePath("/dashboard/cognitive");
    redirectWithMessage("/dashboard/cognitive", "notice", "Privacy settings updated.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update privacy settings.";
    redirectWithMessage("/dashboard/cognitive", "error", message);
  }
}

export async function deleteCognitiveDataAction(): Promise<void> {
  const userId = await requireUser();
  try {
    const result = await deleteCognitiveUserData(userId);
    await logAuditEvent({
      userId,
      action: "cognitive.delete",
      resourceType: "cognitive_data",
      resourceId: userId,
      metadata: { ...result },
    });
    revalidatePath("/dashboard/cognitive");
    redirectWithMessage("/dashboard/cognitive", "notice", "Cognitive data deleted.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete cognitive data.";
    redirectWithMessage("/dashboard/cognitive", "error", message);
  }
}
