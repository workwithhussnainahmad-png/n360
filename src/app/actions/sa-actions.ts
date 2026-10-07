"use server";

import { changeInstitutionStatus } from "@/lib/institution-status";
import { db } from "@/db";
import { superAdmins, employees } from "@/db/schema";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { assertPlatformOperator, assertSecurityPermission } from "@/lib/security-permissions";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { invalidateUserValidity } from "@/lib/user";

export async function createSuperAdminAction(formData: FormData) {
  const session = await getSession();
  await assertSecurityPermission(session, "platform.security");
  if (!session || session.role !== "SUPER_ADMIN" || !session.isSuperAdmin) {
    throw new Error("Unauthorized: Only the Root Super Admin can create other admins");
  }

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const securityQuestion = formData.get("securityQuestion") as string;
  const securityAnswer = formData.get("securityAnswer") as string;

  if (!email || !password || !securityQuestion || !securityAnswer) {
    throw new Error("All fields are required");
  }

  const existingAdmin = await db.select().from(superAdmins).where(eq(superAdmins.email, email));
  if (existingAdmin.length > 0) {
    throw new Error("A Super Admin with this email already exists");
  }

  const passwordHash = await hash(password);
  const securityAnswerHash = await hash(securityAnswer.toLowerCase().trim());

  await db.insert(superAdmins).values({
    email,
    passwordHash,
    securityQuestion,
    securityAnswerHash,
  });

  revalidatePath("/sa/admins");
  return { success: true };
}

export async function deleteSuperAdminAction(adminId: number) {
  const session = await getSession();
  await assertSecurityPermission(session, "platform.security");
  if (!session || session.role !== "SUPER_ADMIN" || !session.isSuperAdmin) {
    throw new Error("Unauthorized: Only the Root Super Admin can delete admins");
  }

  if (session.userId === adminId) {
    throw new Error("You cannot delete yourself");
  }

  // Ensure we don't delete the last super admin or root admin (id = 1)
  if (adminId === 1) {
    throw new Error("Cannot delete the primary root super admin");
  }

  const [target] = await db.select({ root: superAdmins.isSuperAdmin }).from(superAdmins).where(eq(superAdmins.id, adminId)).limit(1);
  if (!target || target.root) throw new Error("Root accounts cannot be removed.");
  await db.delete(superAdmins).where(and(eq(superAdmins.id, adminId), eq(superAdmins.isSuperAdmin, false)));
  await invalidateUserValidity("SUPER_ADMIN", adminId);
  revalidatePath("/sa/admins");
  return { success: true };
}

export async function createEmployeeAction(formData: FormData) {
  const session = await getSession();
  await assertSecurityPermission(session, "platform.accounts");
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized");
  }

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    throw new Error("All fields are required");
  }

  const existingEmployee = await db.select().from(employees).where(eq(employees.email, email));
  if (existingEmployee.length > 0) {
    throw new Error("An employee with this email already exists");
  }

  const passwordHash = await hash(password);

  await db.insert(employees).values({
    name,
    email,
    passwordHash,
    mustChangePassword: true,
  });

  revalidatePath("/sa/employees");
  return { success: true };
}

export async function toggleEmployeeStatusAction(employeeId: number, currentlyDisabled: boolean) {
  const session = await getSession();
  await assertSecurityPermission(session, "platform.accounts");
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized");
  }

  await db.update(employees)
    .set({ deletedAt: currentlyDisabled ? null : new Date() })
    .where(eq(employees.id, employeeId));
  await invalidateUserValidity("EMPLOYEE", employeeId);

  revalidatePath("/sa/employees");
  return { success: true };
}

export async function deleteEmployeeAction(employeeId: number) {
  const session = await getSession();
  await assertSecurityPermission(session, "platform.accounts");
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized: Only super admins can completely delete employees");
  }

  await db.update(employees).set({ deletedAt: new Date() }).where(eq(employees.id, employeeId));
  await invalidateUserValidity("EMPLOYEE", employeeId);
  revalidatePath("/sa/employees");
  return { success: true };
}

export async function updateInstitutionStatusAction(institutionId: number, newStatus: "PENDING" | "APPROVED" | "REJECTED") {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await changeInstitutionStatus(session, institutionId, newStatus);
  for (const path of ["/sa/institutions", "/sa/dashboard", "/employee/institutions", "/employee/dashboard"]) revalidatePath(path);
  return { success: true };
}

export async function updateAppVersionAction(version: string) {
  const session = await getSession();
  await assertPlatformOperator(session);
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
    throw new Error("Unauthorized");
  }

  const { systemSettings } = await import("@/db/schema");

  const settings = await db.select().from(systemSettings).limit(1);
  if (settings.length === 0) {
    await db.insert(systemSettings).values({ mobileAppVersion: version });
  } else {
    await db.update(systemSettings).set({ mobileAppVersion: version, updatedAt: new Date() }).where(eq(systemSettings.id, settings[0].id));
  }

  revalidatePath("/sa/dashboard");
  return { success: true };
}

export async function updatePublicSiteBaseDomainAction(value: string) {
  const session = await getSession();
  await assertSecurityPermission(session, "platform.security");
  if (!session || !['SUPER_ADMIN', 'EMPLOYEE'].includes(session.role)) throw new Error('Unauthorized');
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error('Enter a valid base domain without https:// or a path');
  const { systemSettings } = await import('@/db/schema');
  const [settings] = await db.select({ id: systemSettings.id }).from(systemSettings).limit(1);
  if (settings) await db.update(systemSettings).set({ publicSiteBaseDomain: domain, updatedAt: new Date() }).where(eq(systemSettings.id, settings.id));
  else await db.insert(systemSettings).values({ publicSiteBaseDomain: domain });
  const { invalidatePublicSiteBaseDomainCache } = await import('@/lib/public-site-domain');
  invalidatePublicSiteBaseDomainCache();
  const { redis } = await import("@/lib/redis");
  if (redis.status === "ready") await redis.unlink("cache:sa:system-settings").catch(() => {});
  revalidatePath('/sa/dashboard');
  revalidatePath('/employee/dashboard');
  revalidatePath('/institution/settings/public-website');
  return { domain };
}

export async function updateSoftwareVersionAction(version: string) {
  const session = await getSession();
  await assertPlatformOperator(session);
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
    throw new Error("Unauthorized");
  }

  const normalizedVersion = version.trim();
  if (!normalizedVersion || normalizedVersion.length > 50) {
    throw new Error("Provide a software version up to 50 characters.");
  }

  const { systemSettings } = await import("@/db/schema");
  const settings = await db.select().from(systemSettings).limit(1);
  if (settings.length === 0) {
    await db.insert(systemSettings).values({ softwareVersion: normalizedVersion });
  } else {
    await db.update(systemSettings).set({ softwareVersion: normalizedVersion, updatedAt: new Date() }).where(eq(systemSettings.id, settings[0].id));
  }

  revalidatePath("/sa/apps");
  revalidatePath("/employee/apps");
  return { success: true };
}

import { tickets, ticketHistory } from "@/db/schema";

export async function updateTicketPlatformStatusAction(ticketId: number, platformStatus: "RECEIVED" | "WORKING" | "RESOLVED") {
  const session = await getSession();
  await assertPlatformOperator(session);
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
    throw new Error("Unauthorized");
  }

  // tenant-audit: allow-cross-tenant tickets — platform support is explicitly authorized to manage forwarded tickets from every institution.
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket || !ticket.isForwarded) {
    throw new Error("Ticket not found or not forwarded");
  }

  await db.update(tickets)
    .set({
      platformStatus,
      status: platformStatus === "RECEIVED" ? "OPEN" : platformStatus,
    })
    .where(eq(tickets.id, ticketId));

  await db.insert(ticketHistory).values({
    ticketId,
    actorRole: session.role,
    actorId: session.userId,
    action: "PLATFORM_STATUS_CHANGED",
    notes: `Platform status changed to ${platformStatus}`,
  });

  revalidatePath("/sa/tickets");
  revalidatePath("/employee/tickets");
  revalidatePath("/institution/helpdesk");
  revalidatePath("/student/tickets");
  revalidatePath("/staff/tickets");
  return { success: true };
}
