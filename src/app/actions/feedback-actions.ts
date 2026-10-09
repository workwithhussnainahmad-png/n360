"use server";

import { actionFeedback } from "@/lib/action-feedback";
import { createSectionAction as original_createSectionWithFeedback } from '@/app/actions/institution-actions';
import { updateGraduatedStudentAccessAction as original_updateGraduatedStudentAccessWithFeedback } from '@/app/actions/institution-actions';
import { createTimetableAssignmentAction as original_createTimetableAssignmentWithFeedback } from '@/app/actions/institution-actions';
import { updateClassInchargeAction as original_updateClassInchargeWithFeedback } from '@/app/actions/institution-actions';
import { submitAttendanceAction as original_submitAttendanceWithFeedback } from '@/app/actions/staff-actions';
import { publishStaffAssessmentResultsAction as original_publishStaffAssessmentResultsWithFeedback } from '@/app/actions/assessment-actions';
import { uploadMarksCsvAction as original_uploadMarksCsvWithFeedback } from '@/app/actions/assessment-actions';
import { enterMarksManuallyAction as original_enterMarksManuallyWithFeedback } from '@/app/actions/assessment-actions';
import { gradeMixedTestAction as original_gradeMixedTestWithFeedback } from '@/app/actions/online-test-actions';
import { createInstitutionExamAction as original_createInstitutionExamWithFeedback } from '@/app/actions/assessment-actions';
import { createInstitutionAdminAction as original_createInstitutionAdminWithFeedback } from '@/app/actions/institution-actions';
import { createInstitutionOwnerAction as original_createInstitutionOwnerWithFeedback } from '@/app/actions/institution-actions';
import { updateAppVersionAction as original_updateAppVersionWithFeedback } from '@/app/actions/sa-actions';
import { updatePublicSiteBaseDomainAction as original_updatePublicSiteBaseDomainWithFeedback } from '@/app/actions/sa-actions';
import { updateSoftwareVersionAction as original_updateSoftwareVersionWithFeedback } from '@/app/actions/sa-actions';
import { createOnlineTestAction as original_createOnlineTestWithFeedback } from '@/app/actions/online-test-actions';
import { submitOnlineTestAction as original_submitOnlineTestWithFeedback } from '@/app/actions/online-test-actions';
import { deleteOnlineTestAction as original_deleteOnlineTestWithFeedback } from '@/app/actions/online-test-actions';
import { updateOnlineTestAction as original_updateOnlineTestWithFeedback } from '@/app/actions/online-test-actions';

export async function createSectionWithFeedback(...args: Parameters<typeof original_createSectionWithFeedback>) {
  return actionFeedback(() => original_createSectionWithFeedback(...args));
}
export async function updateGraduatedStudentAccessWithFeedback(...args: Parameters<typeof original_updateGraduatedStudentAccessWithFeedback>) {
  return actionFeedback(() => original_updateGraduatedStudentAccessWithFeedback(...args));
}
export async function createTimetableAssignmentWithFeedback(...args: Parameters<typeof original_createTimetableAssignmentWithFeedback>) {
  return actionFeedback(() => original_createTimetableAssignmentWithFeedback(...args));
}
export async function updateClassInchargeWithFeedback(...args: Parameters<typeof original_updateClassInchargeWithFeedback>) {
  return actionFeedback(() => original_updateClassInchargeWithFeedback(...args));
}
export async function submitAttendanceWithFeedback(...args: Parameters<typeof original_submitAttendanceWithFeedback>) {
  return actionFeedback(() => original_submitAttendanceWithFeedback(...args));
}
export async function publishStaffAssessmentResultsWithFeedback(...args: Parameters<typeof original_publishStaffAssessmentResultsWithFeedback>) {
  return actionFeedback(() => original_publishStaffAssessmentResultsWithFeedback(...args));
}
export async function uploadMarksCsvWithFeedback(...args: Parameters<typeof original_uploadMarksCsvWithFeedback>) {
  return actionFeedback(() => original_uploadMarksCsvWithFeedback(...args));
}
export async function enterMarksManuallyWithFeedback(...args: Parameters<typeof original_enterMarksManuallyWithFeedback>) {
  return actionFeedback(() => original_enterMarksManuallyWithFeedback(...args));
}
export async function gradeMixedTestWithFeedback(...args: Parameters<typeof original_gradeMixedTestWithFeedback>) {
  return actionFeedback(() => original_gradeMixedTestWithFeedback(...args));
}
export async function createInstitutionExamWithFeedback(...args: Parameters<typeof original_createInstitutionExamWithFeedback>) {
  return actionFeedback(() => original_createInstitutionExamWithFeedback(...args));
}
export async function createInstitutionAdminWithFeedback(...args: Parameters<typeof original_createInstitutionAdminWithFeedback>) {
  return actionFeedback(() => original_createInstitutionAdminWithFeedback(...args));
}
export async function createInstitutionOwnerWithFeedback(...args: Parameters<typeof original_createInstitutionOwnerWithFeedback>) {
  return actionFeedback(() => original_createInstitutionOwnerWithFeedback(...args));
}
export async function updateAppVersionWithFeedback(...args: Parameters<typeof original_updateAppVersionWithFeedback>) {
  return actionFeedback(() => original_updateAppVersionWithFeedback(...args));
}
export async function updatePublicSiteBaseDomainWithFeedback(...args: Parameters<typeof original_updatePublicSiteBaseDomainWithFeedback>) {
  return actionFeedback(() => original_updatePublicSiteBaseDomainWithFeedback(...args));
}
export async function updateSoftwareVersionWithFeedback(...args: Parameters<typeof original_updateSoftwareVersionWithFeedback>) {
  return actionFeedback(() => original_updateSoftwareVersionWithFeedback(...args));
}
export async function createOnlineTestWithFeedback(...args: Parameters<typeof original_createOnlineTestWithFeedback>) {
  return actionFeedback(() => original_createOnlineTestWithFeedback(...args));
}
export async function submitOnlineTestWithFeedback(...args: Parameters<typeof original_submitOnlineTestWithFeedback>) {
  return actionFeedback(() => original_submitOnlineTestWithFeedback(...args));
}
export async function deleteOnlineTestWithFeedback(...args: Parameters<typeof original_deleteOnlineTestWithFeedback>) {
  return actionFeedback(() => original_deleteOnlineTestWithFeedback(...args));
}
export async function updateOnlineTestWithFeedback(...args: Parameters<typeof original_updateOnlineTestWithFeedback>) {
  return actionFeedback(() => original_updateOnlineTestWithFeedback(...args));
}
