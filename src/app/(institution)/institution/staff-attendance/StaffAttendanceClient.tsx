"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Search, Save } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StaffMember = {
  id: number;
  name: string;
};

type AttendanceRecord = {
  staffId: number;
  status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE";
};

export function StaffAttendanceClient({ staffMembers }: { staffMembers: StaffMember[] }) {
  const [date, setDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord["status"]>>({});
  const { toast } = useToast();

  const fetchAttendance = useCallback(async (selectedDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/institution/staff-attendance?date=${selectedDate}`);
      if (!res.ok) throw new Error("Failed to load attendance");
      const data = await res.json();
      
      const attMap: Record<string, AttendanceRecord["status"]> = {};
      data.records.forEach((record: any) => {
        attMap[record.staffId] = record.status;
      });
      
      setAttendance(attMap);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAttendance(date);
  }, [date, fetchAttendance]);

  const handleStatusChange = (staffId: number, status: AttendanceRecord["status"]) => {
    setAttendance((prev) => ({ ...prev, [staffId]: status }));
  };

  const handleMarkAll = (status: AttendanceRecord["status"]) => {
    const newAtt = { ...attendance };
    filteredStaff.forEach((s) => {
      newAtt[s.id] = status;
    });
    setAttendance(newAtt);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const records = Object.entries(attendance).map(([staffId, status]) => ({
        staffId,
        status,
      }));

      const res = await fetch("/api/institution/staff-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, records }),
      });

      if (!res.ok) throw new Error("Failed to save attendance");

      toast({ title: "Success", description: "Attendance saved successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredStaff = staffMembers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-stone-50/50 border-b border-border p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="search">Search Staff</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-500" />
              <Input
                id="search"
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="pl-9 w-48 sm:w-64"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-end">
          <Button variant="outline" onClick={() => handleMarkAll("PRESENT")} size="sm" className="h-9">
            Mark All Present
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="h-9">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center p-4 sm:p-8">
            <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-4 sm:p-8 text-center text-stone-500">No staff found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium">Staff Member</th>
                  <th className="px-6 py-3 font-medium">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((staff) => (
                  <tr key={staff.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-stone-900">
                      {staff.name}
                    </td>
                    <td className="px-6 py-4">
                      <Select
                        value={attendance[staff.id] || "PRESENT"}
                        onValueChange={(val: any) => handleStatusChange(staff.id, val)}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRESENT">Present</SelectItem>
                          <SelectItem value="ABSENT">Absent</SelectItem>
                          <SelectItem value="LATE">Late</SelectItem>
                          <SelectItem value="LEAVE">On Leave</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
