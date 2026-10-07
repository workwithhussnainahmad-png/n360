import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DownloadAppUploader } from "@/components/DownloadAppUploader";

export default async function SuperAdminDownloadAppPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login/super-admin");

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-brand-950">Android app download</h1><p className="mt-1 text-stone-600">Manage the APK available on the public download page.</p></div>
      <DownloadAppUploader />
    </div>
  );
}
