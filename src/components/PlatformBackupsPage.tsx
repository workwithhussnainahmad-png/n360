import { getSession } from '@/lib/auth';
import { authorizeSecurityPermission } from '@/lib/security-permissions';
import { db } from '@/db';
import { institutions } from '@/db/schema';
import { asc } from 'drizzle-orm';
import { InstitutionBackupsClient } from '@/app/(superadmin)/sa/backups/InstitutionBackupsClient';
import { CentralDatabaseBackupSettings } from '@/app/(superadmin)/sa/backups/CentralDatabaseBackupSettings';
import { InstitutionRestoreRequests } from '@/components/InstitutionRestoreRequests';



export async function PlatformBackupsPage({ searchParams, basePath }: { basePath: string; searchParams: Promise<{ institutionId?: string }> }) {
  const session = await getSession();
  if (!session || !["SUPER_ADMIN", "EMPLOYEE"].includes(session.role)) throw new Error("Forbidden");
  const query = await searchParams;
  const initialInstitutionId = Number.parseInt(query.institutionId || '', 10);
  const schools = await db.select({ id: institutions.id, name: institutions.name, username: institutions.username })
    .from(institutions).orderBy(asc(institutions.name)).limit(2000);
  return <div className="space-y-8 animate-fade-in">
    <div>
      <h1 className="text-3xl font-display font-bold text-brand-950">Institution Backups</h1>
      <p className="mt-1 max-w-3xl leading-6 text-stone-500">Manage Google Drive backups and review owner-approved institution restore requests.</p>
    </div>
    {await authorizeSecurityPermission(session, 'platform.security') && <CentralDatabaseBackupSettings />}
    {await authorizeSecurityPermission(session, 'platform.restore') && <InstitutionRestoreRequests administrator institutions={schools} />}
    <InstitutionBackupsClient canDownload={await authorizeSecurityPermission(session, 'platform.export')} basePath={basePath} institutions={schools} initialInstitutionId={Number.isInteger(initialInstitutionId) ? initialInstitutionId : undefined} />
  </div>;
}
