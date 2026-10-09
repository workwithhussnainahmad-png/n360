import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DownloadAppUploader } from "@/components/DownloadAppUploader";

export default async function SuperAdminDownloadAppPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login/super-admin");

  return (
    <div className="space-y-6">

      <DownloadAppUploader />
    </div>
  );
}
