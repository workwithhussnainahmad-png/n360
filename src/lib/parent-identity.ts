import { db } from "@/db";
import {
  auditLogs,
  parentAccounts,
  parentStudents,
  students,
} from "@/db/schema";
import type { UserRole } from "@/lib/auth-types";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { hashPassword } from "@/lib/argon2-pool";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const guardianEmailSchema = z
  .string()
  .trim()
  .max(255)
  .email("Enter a valid guardian email address")
  .transform((email) => email.toLowerCase());

export function normalizeGuardianEmail(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  return guardianEmailSchema.parse(value);
}

export type ParentActivation = {
  temporaryPassword: string;
  passwordHash: string;
};

export async function prepareParentActivation(
  institutionId: number,
  guardianEmail: unknown,
): Promise<ParentActivation | null> {
  const email = normalizeGuardianEmail(guardianEmail);
  if (!email) return null;
  const [existing] = await db
    .select({ passwordHash: parentAccounts.passwordHash })
    .from(parentAccounts)
    .where(
      and(
        eq(parentAccounts.institutionId, institutionId),
        eq(parentAccounts.email, email),
      ),
    )
    .limit(1);
  if (existing?.passwordHash) return null;

  const temporaryPassword = crypto.randomBytes(9).toString("base64url");
  return {
    temporaryPassword,
    passwordHash: await hashPassword(temporaryPassword),
  };
}

async function disableParentWithoutChildren(
  tx: DbTransaction,
  institutionId: number,
  parentId: number,
) {
  const [remaining] = await tx
    .select({ value: count() })
    .from(parentStudents)
    .where(
      and(
        eq(parentStudents.institutionId, institutionId),
        eq(parentStudents.parentId, parentId),
      ),
    );

  if (remaining.value === 0) {
    const [disabled] = await tx
      .update(parentAccounts)
      .set({
        status: "DISABLED",
        sessionVersion: sql`${parentAccounts.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(parentAccounts.id, parentId),
          eq(parentAccounts.institutionId, institutionId),
        ),
      )
      .returning({ id: parentAccounts.id });
    return Boolean(disabled);
  }
  return false;
}

export async function syncStudentGuardian(
  tx: DbTransaction,
  params: {
    institutionId: number;
    studentId: number;
    guardianEmail: unknown;
    guardianName?: string | null;
    guardianPhone?: string | null;
    actorId: number;
    actorRole: UserRole;
    ip?: string | null;
    activation?: ParentActivation | null;
  },
) {
  const normalizedEmail = normalizeGuardianEmail(params.guardianEmail);
  const [existingLink] = await tx
    .select({
      parentId: parentStudents.parentId,
      email: parentAccounts.email,
    })
    .from(parentStudents)
    .innerJoin(parentAccounts, eq(parentAccounts.id, parentStudents.parentId))
    .where(
      and(
        eq(parentStudents.institutionId, params.institutionId),
        eq(parentStudents.studentId, params.studentId),
      ),
    )
    .limit(1);

  if (!normalizedEmail) {
    let disabledParentId: number | null = null;
    if (existingLink) {
      await tx
        .delete(parentStudents)
        .where(
          and(
            eq(parentStudents.institutionId, params.institutionId),
            eq(parentStudents.studentId, params.studentId),
          ),
        );
      const disabled = await disableParentWithoutChildren(
        tx,
        params.institutionId,
        existingLink.parentId,
      );
      if (disabled) disabledParentId = existingLink.parentId;
    }

    await tx
      .update(students)
      .set({ guardianEmail: null })
      .where(
        and(
          eq(students.id, params.studentId),
          eq(students.institutionId, params.institutionId),
        ),
      );

    if (existingLink) {
      await tx.insert(auditLogs).values({
        institutionId: params.institutionId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: "PARENT_STUDENT_UNLINKED",
        target: `Student ${params.studentId}; parent ${existingLink.parentId}`,
        ip: params.ip || null,
      });
    }
    return { parentId: null, guardianEmail: null, created: false, activation: null, disabledParentId };
  }

  let [parent] = await tx
    .insert(parentAccounts)
    .values({
      institutionId: params.institutionId,
      name: params.guardianName?.trim() || null,
      email: normalizedEmail,
      phone: params.guardianPhone?.trim() || null,
      passwordHash: params.activation?.passwordHash || null,
    })
    .onConflictDoNothing({
      target: [parentAccounts.institutionId, parentAccounts.email],
    })
    .returning({
      id: parentAccounts.id,
      passwordHash: parentAccounts.passwordHash,
    });
  const created = Boolean(parent);

  if (!parent) {
    [parent] = await tx
      .select({
        id: parentAccounts.id,
        passwordHash: parentAccounts.passwordHash,
      })
      .from(parentAccounts)
      .where(
        and(
          eq(parentAccounts.institutionId, params.institutionId),
          eq(parentAccounts.email, normalizedEmail),
        ),
      )
      .limit(1);
  }
  if (!parent) throw new Error("PARENT_ACCOUNT_LINK_FAILED");

  let activationClaimed = created && Boolean(params.activation);
  if (!parent.passwordHash && params.activation) {
    const [activated] = await tx
      .update(parentAccounts)
      .set({
        passwordHash: params.activation.passwordHash,
        status: "PENDING_ACTIVATION",
        mustChangePassword: true,
        sessionVersion: sql`${parentAccounts.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(parentAccounts.id, parent.id),
          sql`${parentAccounts.passwordHash} IS NULL`,
        ),
      )
      .returning({ id: parentAccounts.id });
    activationClaimed = Boolean(activated);
    if (activated) parent.passwordHash = params.activation.passwordHash;
  }

  await tx
    .update(parentAccounts)
    .set({
      name: params.guardianName?.trim() || undefined,
      phone: params.guardianPhone?.trim() || undefined,
      status: parent.passwordHash ? "ACTIVE" : "PENDING_ACTIVATION",
      deletedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(parentAccounts.id, parent.id));

  await tx
    .insert(parentStudents)
    .values({
      institutionId: params.institutionId,
      parentId: parent.id,
      studentId: params.studentId,
      linkedById: params.actorId,
      linkedByRole: params.actorRole,
    })
    .onConflictDoUpdate({
      target: [parentStudents.institutionId, parentStudents.studentId],
      set: {
        parentId: parent.id,
        linkedById: params.actorId,
        linkedByRole: params.actorRole,
        updatedAt: new Date(),
      },
    });

  await tx
    .update(students)
    .set({ guardianEmail: normalizedEmail })
    .where(
      and(
        eq(students.id, params.studentId),
        eq(students.institutionId, params.institutionId),
      ),
    );

  let disabledParentId: number | null = null;
  if (existingLink && existingLink.parentId !== parent.id) {
    const disabled = await disableParentWithoutChildren(
      tx,
      params.institutionId,
      existingLink.parentId,
    );
    if (disabled) disabledParentId = existingLink.parentId;
  }

  const action = existingLink
    ? existingLink.parentId === parent.id
      ? "GUARDIAN_EMAIL_CONFIRMED"
      : "GUARDIAN_EMAIL_CHANGED"
    : "PARENT_STUDENT_LINKED";
  await tx.insert(auditLogs).values({
    institutionId: params.institutionId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action,
    target: `Student ${params.studentId}; parent ${parent.id}`,
    ip: params.ip || null,
  });

  return {
    parentId: parent.id,
    guardianEmail: normalizedEmail,
    created,
    activation: activationClaimed ? params.activation || null : null,
    disabledParentId,
    newlyLinked: !existingLink || existingLink.parentId !== parent.id,
  };
}
