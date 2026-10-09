"use server";

import { ActionInputError } from "@/lib/action-input-error";
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { changeInstitutionStatus } from '@/lib/institution-status';
export async function updateInstitutionStatusAction(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  const session = await getSession();
  if (!session) throw new ActionInputError('Unauthorized');
  await changeInstitutionStatus(session, id, status);
  revalidatePath('/employee/institutions'); revalidatePath('/sa/institutions');
  return { success: true };
}
export async function deleteInstitutionAction(_id: number, _confirmationName: string): Promise<never> {
  void _id; void _confirmationName;
  throw new ActionInputError('Permanent institution deletion is disabled.');
}
