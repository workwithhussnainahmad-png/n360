"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { displaySectionName } from "@/lib/class-section-label";

interface ClassOption { id: number; name: string }
interface SectionOption { id: number; classId: number; name: string }

export function StaffAnnouncementForm({
  classes,
  sections,
  action
}: {
  classes: ClassOption[];
  sections: SectionOption[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [targetType, setTargetType] = useState<string>("CLASS");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const filteredSections = selectedClassId 
    ? sections.filter(s => s.classId === parseInt(selectedClassId) && displaySectionName(s.name))
    : [];

  return (
    <Card>
      <CardHeader className="border-b border-border bg-stone-50/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="h-5 w-5 text-brand-600" />
          New Broadcast
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <form action={action} className="space-y-4 pt-2 text-left">
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">Message Title</label>
            <input
              type="text"
              name="title"
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Assignment Details"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">Target Audience</label>
            <select
              name="targetType"
              required
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                setSelectedClassId("");
                setSelectedSectionId("");
              }}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="CLASS">Specific Class</option>
              <option value="SECTION">Specific Section</option>
            </select>
          </div>

          {(targetType === "CLASS" || targetType === "SECTION") && (
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Select Class</label>
              <select 
                name="targetClassId" 
                required 
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedSectionId("");
                }}
                className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Choose Class...</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {targetType === "SECTION" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Select Section</label>
              <select
                name="targetSectionId"
                required
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Choose Section...</option>
                {filteredSections.map(s => <option key={s.id} value={s.id}>{displaySectionName(s.name)}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">Message Content</label>
            <textarea
              name="content"
              required
              rows={4}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Type your message here..."
            />
          </div>
          <SubmitButton
            className="w-full bg-brand-800 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-900 transition-colors"
          >
            Send Announcement
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
