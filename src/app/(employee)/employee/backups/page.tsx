import { PlatformBackupsPage } from '@/components/PlatformBackupsPage';
export const dynamic = 'force-dynamic';
export default function BackupsPage({ searchParams }: { searchParams: Promise<{ institutionId?: string }> }) {
  return <PlatformBackupsPage searchParams={searchParams} basePath="/employee/backups" />;
}
