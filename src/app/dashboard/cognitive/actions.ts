"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { logAuditEvent } from "@/lib/audit-log";
import { assertSkillPublicationEnabled } from "@/lib/cognitive-guards";
import {
  publishSkill,
  refreshSkillDraftById,
  setPatternStatus,
  setSkillPublicationDisabled,
} from "@/lib/cognitive-db";

async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
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
