import { Metadata } from "next";
import DiaryClient from "../../../components/diary/DiaryClient";

export const metadata: Metadata = {
  title: "Class Diary | Staff",
};

export default function StaffDiaryPage() {
  return (
    <div className="space-y-6">

      <DiaryClient />
    </div>
  );
}
