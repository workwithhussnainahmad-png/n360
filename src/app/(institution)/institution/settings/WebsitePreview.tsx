'use client';
import { useDeferredValue } from 'react';
import { InstitutionHomepage } from '@/app/sites/[slug]/[[...path]]/InstitutionHomepage';
import { ResponsivePreview } from '@/components/public-site/ResponsivePreview';
import type { PublicInstitutionTenant } from '@/lib/institution-tenant';
export function WebsitePreview({ tenant, events }: { tenant: PublicInstitutionTenant; events: Parameters<typeof InstitutionHomepage>[0]['publicEvents'] }) {
  const previewTenant = useDeferredValue(tenant);
  return <ResponsivePreview title="Institution website preview"><InstitutionHomepage preview tenant={previewTenant} publicEvents={events} baseDomain="nisaab360.app" studentLoginUrl="/student-login" /></ResponsivePreview>;
}
