import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdmissionsManager } from './AdmissionsManager';
import { ApplicationsReviewPanel } from './ApplicationsReviewPanel';
import { CampusAdmissionsAvailability } from './CampusAdmissionsAvailability';
import { canConfigureAdmissions } from '@/lib/admission-campus';
import { getTenantContext } from '@/lib/rbac';

const sections = [
  { key: 'setup', label: 'Admissions setup', description: 'New cycle and program or class' },
  { key: 'status', label: 'Open / close', description: 'Publish or close an admission cycle' },
  { key: 'review', label: 'Review applications', description: 'Process submitted applications' },
  { key: 'offline', label: 'Offline applications', description: 'Record walk-in applicants' },
] as const;

export default async function InstitutionAdmissionsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== 'INSTITUTION' && session.role !== 'INSTITUTION_ADMIN')) redirect('/login');
  const canConfigure = await canConfigureAdmissions(getTenantContext(session));
  const availableSections = canConfigure ? sections : sections.filter(item => item.key !== 'setup');
  const requestedSection = (await searchParams).section;
  if (!canConfigure && requestedSection === 'setup') redirect('/institution/admissions?section=status');
  const section = availableSections.some((item) => item.key === requestedSection) ? requestedSection : canConfigure ? 'setup' : 'status';

  return (
    <div className="space-y-8 animate-fade-in">

      <nav aria-label="Admissions sections" className={`grid gap-3 sm:grid-cols-2 ${canConfigure ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        {availableSections.map((item) => <Link key={item.key} href={`/institution/admissions?section=${item.key}`} scroll={false} className={`rounded-xl border p-4 text-left transition ${section === item.key ? 'border-brand-600 bg-brand-950 text-white shadow-sm' : 'border-stone-200 bg-white text-stone-800 hover:border-brand-300'}`}><span className="block text-sm font-bold">{item.label}</span><span className={`mt-1 block text-xs leading-5 ${section === item.key ? 'text-white/70' : 'text-stone-500'}`}>{!canConfigure && item.key === 'status' ? 'Open or close intake for this campus' : item.description}</span></Link>)}
      </nav>
      {section === 'setup' && <AdmissionsManager mode="setup" />}
      {section === 'status' && (canConfigure ? <AdmissionsManager mode="status" /> : <CampusAdmissionsAvailability refreshKey="campus" />)}
      {section === 'review' && <ApplicationsReviewPanel />}
      {section === 'offline' && <ApplicationsReviewPanel offlineOnly />}
    </div>
  );
}
