import "server-only";
import { cookies } from "next/headers";
import { isWorkspace, WORKSPACE_COOKIE, type Workspace } from "./workspace";

/** Caregivers always see Clinical; everyone else gets what they last chose, Clinical to start. */
export async function getWorkspace(role: string): Promise<Workspace> {
  if (role === "dsp") return "clinical";
  const v = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return isWorkspace(v) ? v : "clinical";
}
