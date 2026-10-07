'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type Offering = { id: number; title: string; description: string | null };
type Campus = { id: number; name: string };

export function AdmissionsApplicationForm({ offerings, campuses, campusId, onCampusChange, accentColor, today }: { offerings: Offering[]; campuses: Campus[]; campusId: string; onCampusChange: (id: string) => void; accentColor: string; today: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    applicationNumber: string;
    campusName: string;
    email: string;
    temporaryPassword: string | null;
    existingAccount: boolean;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch('/api/public/admissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offeringId: Number(data.get('offeringId')),
          campusId: Number(campusId),
          studentName: data.get('studentName'),
          dateOfBirth: data.get('dateOfBirth'),
          gender: data.get('gender'),
          guardianName: data.get('guardianName'),
          guardianEmail: data.get('guardianEmail'),
          guardianPhone: data.get('guardianPhone'),
          previousInstitution: data.get('previousInstitution'),
          previousClassMarks: data.get('previousClassMarks'),
          medicalInformation: data.get('medicalInformation'),
          notes: data.get('notes'),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit application');
      setResult({
        applicationNumber: result.application.applicationNumber,
        campusName: result.application.campusName,
        email: result.applicantAccount.email,
        temporaryPassword: result.applicantAccount.temporaryPassword,
        existingAccount: result.applicantAccount.existingAccount,
      });
      form.reset();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to submit application');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="border-l-4 border-emerald-700 bg-emerald-50 p-7 text-emerald-950">
        <h2 className="text-2xl font-semibold">Application received</h2>
        <p className="mt-3 leading-7">Save your application number. The institution will use it when contacting you about the next step.</p>
        <p className="mt-5 inline-block border border-emerald-200 bg-white px-4 py-3 font-mono text-lg font-bold tracking-wide">{result.applicationNumber}</p>
        <p className="mt-3 text-sm"><strong>Campus:</strong> {result.campusName}</p>
        {result.temporaryPassword ? (
          <div className="mt-6 border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="font-semibold">Save these temporary login details now</p>
            <p className="mt-3 text-sm">Email: <strong>{result.email}</strong></p>
            <p className="mt-1 text-sm">Temporary password: <strong className="font-mono text-base">{result.temporaryPassword}</strong></p>
            <p className="mt-3 text-xs">This password is shown only once. You must replace it after logging in.</p>
          </div>
        ) : (
          <p className="mt-5 text-sm">This application was added to your existing applicant account for <strong>{result.email}</strong>.</p>
        )}
        <Link href="/admissions/login" className="mt-6 inline-block bg-emerald-800 px-5 py-3 text-sm font-bold text-white">Open applicant login</Link>
      </div>
    );
  }

  const fieldClass = 'mt-2 h-12 w-full border border-black/15 bg-white px-4 text-sm font-normal outline-none transition focus:border-black focus:ring-0';
  return (
    <form onSubmit={submit} className="space-y-5">
      {campuses.length > 1 ? <label className="block text-xs font-bold uppercase tracking-[0.08em]">Campus<select name="campusId" required disabled={submitting} value={campusId} onChange={event => onCampusChange(event.target.value)} className={fieldClass}><option value="">Select Campus</option>{campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label> : <p className="text-sm"><strong>Campus:</strong> {campuses[0]?.name}</p>}
      <label className="block text-xs font-bold uppercase tracking-[0.08em]">Applying for<select name="offeringId" required className={fieldClass}><option value="">Select a program or class</option>{offerings.map((offering) => <option key={offering.id} value={offering.id}>{offering.title}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-[0.08em]">Student name<input name="studentName" required minLength={2} maxLength={255} className={fieldClass} /></label>
        <label className="text-xs font-bold uppercase tracking-[0.08em]">Date of birth<input name="dateOfBirth" required type="date" max={today} className={fieldClass} /></label>
        <label className="text-xs font-bold uppercase tracking-[0.08em]">Gender<select name="gender" required className={fieldClass}><option value="">Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label>
        <label className="text-xs font-bold uppercase tracking-[0.08em]">Parent or guardian name<input name="guardianName" required minLength={2} maxLength={255} className={fieldClass} /></label>
        <label className="text-xs font-bold uppercase tracking-[0.08em]">Parent or guardian email<input name="guardianEmail" required type="email" maxLength={255} className={fieldClass} /></label>
        <label className="text-xs font-bold uppercase tracking-[0.08em]">Parent or guardian phone<input name="guardianPhone" required type="tel" minLength={5} maxLength={50} className={fieldClass} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-[0.08em]">Previous institution <span className="font-normal normal-case tracking-normal text-black/40">(optional)</span><input name="previousInstitution" maxLength={255} className={fieldClass} /></label>
        <label className="block text-xs font-bold uppercase tracking-[0.08em]">Recent marks <span className="font-normal normal-case tracking-normal text-black/40">(optional)</span><input name="previousClassMarks" maxLength={100} className={fieldClass} placeholder="Obtained / total, e.g. 450 / 550" /></label>
      </div>
      <label className="block text-xs font-bold uppercase tracking-[0.08em]">Health and support information <span className="font-normal normal-case tracking-normal text-black/40">(optional)</span><textarea name="medicalInformation" rows={3} maxLength={2000} className={`${fieldClass} h-auto min-h-24 py-3`} placeholder="Allergies, medical conditions, regular medicines, disabilities, or emergency instructions. Write None if there is nothing to report." /></label>
      <label className="block text-xs font-bold uppercase tracking-[0.08em]">Additional information <span className="font-normal normal-case tracking-normal text-black/40">(optional)</span><textarea name="notes" rows={4} maxLength={2000} className={`${fieldClass} h-auto min-h-28 py-3`} /></label>
      {error && <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={submitting} className="h-12 px-7 text-sm font-bold text-white disabled:opacity-60" style={{ backgroundColor: accentColor }}>{submitting ? 'Submitting...' : 'Submit application'}</button>
    </form>
  );
}
