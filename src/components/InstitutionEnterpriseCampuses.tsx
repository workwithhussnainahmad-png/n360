import { listRootCampuses } from '@/lib/campus-workspaces';
import { CampusLoginForm } from '@/components/institution/CampusLoginForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function InstitutionEnterpriseCampuses({ institutionId }: { institutionId: number }) {
  const campuses = await listRootCampuses(institutionId);
  const endpoint = `/api/employee/institutions/${institutionId}/campuses`;
  return <Card><CardHeader><CardTitle>Enterprise campuses</CardTitle></CardHeader><CardContent className="space-y-6">
    <p className="text-sm text-stone-500">Only platform admins and employees can create these campuses. Each campus has its own login and workspace.</p>
    <div className="grid gap-4 md:grid-cols-2">{campuses.map(campus => <div key={campus.id} className="border border-stone-200 p-4">
      <h3 className="font-semibold">{campus.name}</h3><p className="text-sm text-stone-500">{campus.address}</p>
      {campus.name === campus.workspaceName ? <p className="mt-2 text-sm">Login email: {campus.loginEmail}</p>
        : <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Set up login</summary><div className="mt-4"><CampusLoginForm existingCampus={campus} endpoint={endpoint} /></div></details>}
    </div>)}</div>
    <div className="max-w-md"><h3 className="mb-4 font-semibold">Add campus</h3><CampusLoginForm endpoint={endpoint} /></div>
  </CardContent></Card>;
}
