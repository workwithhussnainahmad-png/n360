import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { DownloadAppUploader } from "@/components/DownloadAppUploader";
import { SoftwareVersionUpdater } from "@/components/sa/SoftwareVersionUpdater";

export async function AppsManagement() {
  const [settings] = await db.select({ softwareVersion: systemSettings.softwareVersion }).from(systemSettings).limit(1);

  return (
    <div className="space-y-6">

      <div className="grid gap-6 xl:grid-cols-2">
        <DownloadAppUploader type="app" heading="Mobile App Link" />
        <DownloadAppUploader type="software" heading="Software Link" />
      </div>
      <SoftwareVersionUpdater currentVersion={settings?.softwareVersion || "1.0.0"} />
    </div>
  );
}
