'use client';

import { useState } from 'react';
import { AdmissionsApplicationForm } from './AdmissionsApplicationForm';
import { OfflineAdmissionForm, type OfflineAdmissionFormProps } from './OfflineAdmissionForm';

export function AdmissionIntakeForms({ campuses, today, ...props }: Omit<OfflineAdmissionFormProps, 'campusName'> & {
  campuses: Array<{ id: number; name: string }>;
  today: string;
}) {
  const [campusId, setCampusId] = useState(campuses.length === 1 ? String(campuses[0].id) : '');
  const selectedCampus = campuses.find(campus => String(campus.id) === campusId);
  return <>
    <div className="mt-7 border-t border-black/10 pt-8">
      <AdmissionsApplicationForm offerings={props.offerings} campuses={campuses} campusId={campusId} onCampusChange={setCampusId} accentColor={props.accentColor} today={today} />
    </div>
    <div className="mt-6">
      <OfflineAdmissionForm {...props} campusName={selectedCampus?.name ?? null} />
    </div>
  </>;
}
