/**
 * Audited writes. Every insert, update, and delete against a PHI table goes
 * through here so the audit row is written in the same transaction as the
 * change. Nothing else in the app should call db.insert/update/delete directly.
 */
import { eq, getTableName, sql, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import type { PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { Db } from "./index";

/** A database or an open transaction. Nested calls become savepoints. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
import { auditLog } from "./schema";

type TableWithId = PgTable & { id: PgTable["_"]["columns"][string] };

export interface Actor {
  userId: string | null;
}

/** Fields that never belong in the audit log's before/after snapshot. */
const REDACT = new Set(["passwordHash", "ssnEncrypted", "signatureCodeHash"]);

function snapshot(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = REDACT.has(k) ? "[redacted]" : v;
  return out;
}

export function audited(db: Executor, actor: Actor) {
  return {
    async insert<T extends TableWithId>(table: T, values: InferInsertModel<T>): Promise<InferSelectModel<T>> {
      return db.transaction(async (tx) => {
        const [row] = (await tx.insert(table).values(values as never).returning()) as InferSelectModel<T>[];
        await tx.insert(auditLog).values({
          actorUserId: actor.userId,
          action: "insert",
          tableName: getTableName(table),
          recordId: String((row as { id: unknown }).id),
          before: null,
          after: snapshot(row as Record<string, unknown>),
        });
        return row;
      });
    },

    async update<T extends TableWithId>(
      table: T,
      id: string,
      values: PgUpdateSetSource<T>,
    ): Promise<InferSelectModel<T>> {
      return db.transaction(async (tx) => {
        const [before] = (await tx.select().from(table as PgTable).where(eq(table.id, id))) as InferSelectModel<T>[];
        if (!before) throw new Error(`${getTableName(table)} ${id} not found`);
        const [after] = (await tx
          .update(table)
          .set({ ...(values as object), updatedAt: sql`now()` } as never)
          .where(eq(table.id, id))
          .returning()) as InferSelectModel<T>[];
        await tx.insert(auditLog).values({
          actorUserId: actor.userId,
          action: "update",
          tableName: getTableName(table),
          recordId: id,
          before: snapshot(before as Record<string, unknown>),
          after: snapshot(after as Record<string, unknown>),
        });
        return after;
      });
    },

    async delete<T extends TableWithId>(table: T, id: string): Promise<void> {
      return db.transaction(async (tx) => {
        const [before] = (await tx.select().from(table as PgTable).where(eq(table.id, id))) as InferSelectModel<T>[];
        if (!before) throw new Error(`${getTableName(table)} ${id} not found`);
        await tx.delete(table).where(eq(table.id, id));
        await tx.insert(auditLog).values({
          actorUserId: actor.userId,
          action: "delete",
          tableName: getTableName(table),
          recordId: id,
          before: snapshot(before as Record<string, unknown>),
          after: null,
        });
      });
    },

    /** Record a non-row event such as login, logout, or revealing a protected field. */
    async event(action: "login" | "logout" | "reveal", recordId: string | null, tableName = "users", after?: Record<string, unknown>): Promise<void> {
      await db.insert(auditLog).values({
        actorUserId: actor.userId,
        action,
        tableName,
        recordId,
        after: after ?? null,
      });
    },
  };
}

export type Audited = ReturnType<typeof audited>;
