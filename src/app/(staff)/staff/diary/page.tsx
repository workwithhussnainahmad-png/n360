import { Metadata } from "next";
import DiaryClient from "../../../components/diary/DiaryClient";

export const metadata: Metadata = {
  title: "Class Diary | Staff",
};

export default function StaffDiaryPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-bold text-brand-950">Class Diary</h1><p className="mt-1 text-stone-500">Share classwork and homework updates with your assigned classes.</p></div>
      <DiaryClient />
    </div>
  );
}
