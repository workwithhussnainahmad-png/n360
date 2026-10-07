"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/toaster";

export function StudentLeaveRequestButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [leaveType, setLeaveType] = useState<"single" | "multiple">("single");
  const [reason, setReason] = useState("");
  const [singleDate, setSingleDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/student/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          startDate: leaveType === "single" ? singleDate : startDate,
          endDate: leaveType === "single" ? singleDate : endDate,
          parentPhone,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit leave request");
      }

      toast({
        title: "Success",
        description: "Leave request submitted successfully",
      });
      setOpen(false);
      // Reset form
      setReason("");
      setSingleDate("");
      setStartDate("");
      setEndDate("");
      setParentPhone("");
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to submit leave request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="block h-full w-full text-left focus:outline-none">
        <Card className="bg-gradient-to-br from-orange-500 to-orange-800 text-white border-none shadow-md hover:shadow-lg transition-shadow h-full">
          <CardContent className="p-3 lg:p-4 h-full flex flex-col justify-center">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-orange-100 text-xs lg:text-sm font-medium mb-1">Take a Break</p>
                <h3 className="text-xl lg:text-2xl font-display font-bold leading-tight">Request a Leave</h3>
              </div>
              <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <CalendarDays className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
              </div>
            </div>
            <p className="text-orange-200 text-xs mt-4">Apply for short or long leaves.</p>
          </CardContent>
        </Card>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-5 h-full">
            {/* Left Side: Creative Banner */}
            <div className="md:col-span-2 bg-gradient-to-br from-orange-500 to-orange-700 p-6 sm:p-8 text-white flex flex-col justify-between">
              <div>
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center mb-6">
                  <CalendarDays className="h-6 w-6 text-white" />
                </div>
                <DialogTitle className="text-3xl font-display font-bold leading-tight mb-3">
                  Request<br/>a Leave
                </DialogTitle>
                <DialogDescription className="text-left text-orange-100 text-sm leading-relaxed">
                  Need some time off? Submit your leave application to your class teacher. Please provide an honest reason and valid dates.
                </DialogDescription>
              </div>
              <div className="mt-8 hidden md:block">
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/10">
	                  <p className="text-sm italic text-orange-50 font-medium leading-snug">&quot;Taking time to rest and recover is just as important as the work itself.&quot;</p>
                </div>
              </div>
            </div>
            
            {/* Right Side: Form */}
            <div className="md:col-span-3 p-6 sm:p-8 bg-white">
              <form onSubmit={handleSubmit} className="space-y-6 pt-1 text-left">
                <div className="space-y-3">
                  <Label className="text-stone-700 font-semibold text-sm">How long do you need?</Label>
                  <RadioGroup
                    value={leaveType}
                    onValueChange={(v: string) => setLeaveType(v as "single" | "multiple")}
                    className="flex flex-col sm:flex-row gap-3"
                  >
                    <div className="flex items-center space-x-3 bg-stone-50 border border-stone-200 px-4 py-3 rounded-lg flex-1 cursor-pointer hover:bg-orange-50 hover:border-orange-200 transition-all [&:has([data-state=active])]:bg-orange-50 [&:has([data-state=active])]:border-orange-500">
                      <RadioGroupItem value="single" id="single" className="text-orange-600 border-orange-200" />
                      <Label htmlFor="single" className="font-medium cursor-pointer w-full text-stone-700">One Day</Label>
                    </div>
                    <div className="flex items-center space-x-3 bg-stone-50 border border-stone-200 px-4 py-3 rounded-lg flex-1 cursor-pointer hover:bg-orange-50 hover:border-orange-200 transition-all [&:has([data-state=active])]:bg-orange-50 [&:has([data-state=active])]:border-orange-500">
                      <RadioGroupItem value="multiple" id="multiple" className="text-orange-600 border-orange-200" />
                      <Label htmlFor="multiple" className="font-medium cursor-pointer w-full text-stone-700">Multiple Days</Label>
                    </div>
                  </RadioGroup>
                </div>

                {leaveType === "single" ? (
                  <div className="space-y-2">
                    <Label htmlFor="singleDate" className="text-stone-600">Select Date</Label>
                    <Input
                      id="singleDate"
                      type="date"
                      required
                      className="bg-stone-50 border-stone-200 focus-visible:ring-orange-500 h-11"
                      value={singleDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSingleDate(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate" className="text-stone-600">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        required
                        className="bg-stone-50 border-stone-200 focus-visible:ring-orange-500 h-11"
                        value={startDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate" className="text-stone-600">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        required
                        className="bg-stone-50 border-stone-200 focus-visible:ring-orange-500 h-11"
                        value={endDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="parentPhone" className="text-stone-600">Parent/Guardian Cell Number</Label>
                  <Input
                    id="parentPhone"
                    required
                    type="tel"
                    placeholder="+923000000000"
                    className="bg-stone-50 border-stone-200 focus-visible:ring-orange-500 h-11"
                    value={parentPhone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParentPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason" className="text-stone-600">Reason for Leave</Label>
                  <Textarea
                    id="reason"
                    required
                    placeholder="E.g., Sick leave, Family event..."
                    className="bg-stone-50 border-stone-200 focus-visible:ring-orange-500 resize-none min-h-[80px]"
                    value={reason}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-stone-100 mt-6">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-stone-500 hover:text-stone-700">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading} className="bg-orange-600 hover:bg-orange-700 text-white min-w-[140px] shadow-md shadow-orange-500/20">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Request
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
