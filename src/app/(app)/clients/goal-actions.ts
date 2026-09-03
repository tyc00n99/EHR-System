"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { fieldErrors, formToObject, goalSchema, medicationSchema, type ActionState } from "@/lib/validation";

export async function createGoal(personId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = goalSchema.safeParse({ ...formToObject(fd), questions: fd.getAll("questions[]").map(String).map((q) => q.trim()).filter(Boolean) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the fields." };
  const { questions, ...goal } = parsed.data;
  const db = await getDb();
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    const g = await w.insert(schema.goals, { ...goal, personId, createdBy: user.id });
    for (const [i, prompt] of questions.entries()) await w.insert(schema.goalQuestions, { goalId: g.id, prompt, sortOrder: i });
  });
  revalidatePath(`/clients/${personId}`);
  return { message: "Goal added." };
}

export async function setGoalStatus(goalId: string, personId: string, status: "active" | "met" | "discontinued"): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.goals, goalId, { status });
  revalidatePath(`/clients/${personId}`);
}

export async function addGoalQuestion(goalId: string, personId: string, prompt: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const p = prompt.trim();
  if (p.length < 3) return { message: "Write the question first." };
  const db = await getDb();
  await audited(db, { userId: user.id }).insert(schema.goalQuestions, { goalId, prompt: p, sortOrder: 99 });
  revalidatePath(`/clients/${personId}`);
  return {};
}

export async function retireGoalQuestion(questionId: string, personId: string): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.goalQuestions, questionId, { active: false });
  revalidatePath(`/clients/${personId}`);
}

export async function createMedication(personId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = medicationSchema.safeParse({ ...formToObject(fd), times: String(fd.get("times") ?? "").split(/[,\s]+/).filter(Boolean) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the fields." };
  const db = await getDb();
  await audited(db, { userId: user.id }).insert(schema.medications, { ...parsed.data, personId });
  revalidatePath(`/clients/${personId}`);
  return { message: "Medication added." };
}

export async function setMedicationActive(id: string, personId: string, active: boolean): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.medications, id, { active, ...(active ? {} : { endDate: new Date().toISOString().slice(0, 10) }) });
  revalidatePath(`/clients/${personId}`);
}
