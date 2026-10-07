"use client";

import { useState, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, FileText, Plus, Upload, MoreHorizontal, Eye, Edit, Trash } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toaster";
import { displaySectionName } from "@/lib/class-section-label";
import { useRouter } from "next/navigation";

type StudentRow = {
  id: number;
  loginRollNumber: string;
  name: string;
  gender: string;
  yearOfJoining: number;
  classId: number;
  sectionId: number;
  classRollNumber: string;
  phone: string | null;
  guardianEmail: string | null;
};

type CreateStudentResponse = {
  credentials?: {
    loginRollNumber?: string;
  };
};

type ImportStudentsResponse = {
  imported?: number;
  initialPassword?: string;
  error?: string;
  errors?: string[];
};

type StudentTableRow = StudentRow & {
  searchString: string;
};

type StudentColumn = {
  header: string;
  accessorKey?: keyof StudentTableRow;
  cell?: (student: StudentTableRow) => ReactNode;
  sortable?: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function StudentsClient({
  students,
  classes,
  sections,
  totalCount,
  page,
  limit
}: {
  students: StudentRow[];
  classes: { id: number; name: string }[];
  sections: { id: number; classId: number; name: string }[];
  totalCount?: number;
  page?: number;
  limit?: number;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<StudentRow[]>(students);
  const [studentsProp, setStudentsProp] = useState(students);

  if (students !== studentsProp) {
    setStudentsProp(students);
    setRows(students);
  }
  
  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importStep, setImportStep] = useState<"guide" | "upload">("guide");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [campuses, setCampuses] = useState<{ id: number; name: string }[] | null>(null);
  const campusesLoading = isCreateOpen && campuses === null;
  
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<StudentRow | null>(null);

  // Filters state
  const [filterClassId, setFilterClassId] = useState<string>("");
  const [filterSectionId, setFilterSectionId] = useState<string>("");

  // Create form state
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const createFilteredSections = selectedClassId 
    ? sections.filter(s => s.classId === parseInt(selectedClassId))
    : [];

  const mainFilteredSections = filterClassId 
    ? sections.filter(s => s.classId === parseInt(filterClassId))
    : [];
  const rowsPerPage = filterClassId || filterSectionId ? 30 : 60;

  useEffect(() => {
    if (!isCreateOpen || campuses !== null) return;

    let ignore = false;
    api.get<{ campuses: { id: number; name: string }[] }>("/api/institution/campuses")
      .then((data) => {
        if (!ignore) setCampuses(data.campuses);
      })
      .catch(() => {
        if (!ignore) {
          setCampuses([]);
          toast({ title: "Could not load campuses", variant: "destructive" });
        }
      });

    return () => {
      ignore = true;
    };
  }, [isCreateOpen, campuses, toast]);

  // Prepare table data with combined search field
  const tableData = useMemo(() => {
    let filtered = rows;
    if (filterClassId) {
      filtered = filtered.filter(s => s.classId === parseInt(filterClassId));
    }
    if (filterSectionId) {
      filtered = filtered.filter(s => s.sectionId === parseInt(filterSectionId));
    }
    return filtered.map(s => ({
      ...s,
      searchString: `${s.name} ${s.loginRollNumber}`
    }));
  }, [rows, filterClassId, filterSectionId]);

  const columns: StudentColumn[] = [
    { header: "Roll Number", accessorKey: "loginRollNumber" as const, sortable: true },
    { header: "Name", accessorKey: "name" as const, cell: (s) => <span className="font-medium text-brand-900">{s.name}</span> },
    { header: "Gender", accessorKey: "gender" as const },
    { header: "Year", accessorKey: "yearOfJoining" as const },
    { 
      header: "Actions", 
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4 text-stone-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {s.id > 0 && (
              <DropdownMenuItem onClick={() => router.push(`/institution/students/${s.id}`)}>
                <Eye className="h-4 w-4 mr-2" /> View Profile
              </DropdownMenuItem>
            )}
            {s.id > 0 && (
              <DropdownMenuItem onClick={() => router.push(`/institution/students/id-cards?studentId=${s.id}`)}>
                <CreditCard className="h-4 w-4 mr-2" /> ID Card
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setEditStudent(s)}>
              <Edit className="h-4 w-4 mr-2" /> Edit Student
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => setDeleteStudent(s)}>
              <Trash className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    
    try {
      const res = await api.post<CreateStudentResponse>("/api/institution/students", data);
      toast({ 
        title: "Student Created", 
        description: `Login ID generated: ${res.credentials?.loginRollNumber || 'Success'}`, 
        variant: "success" 
      });
      setIsCreateOpen(false);

      const classId = Number(data.classId);
      const sectionIdRaw = data.sectionId ? Number(data.sectionId) : NaN;
      const sectionId = Number.isInteger(sectionIdRaw) && sectionIdRaw > 0
        ? sectionIdRaw
        : (sections.find((s) => s.classId === classId)?.id ?? 0);

      setRows((current) => [
        {
          id: -Date.now(),
          loginRollNumber: res.credentials?.loginRollNumber || "",
          name: `${String(data.firstName || "")} ${String(data.lastName || "")}`.trim(),
          gender: String(data.gender || "MALE"),
          yearOfJoining: Number(data.yearOfJoining) || new Date().getFullYear(),
          classId,
          sectionId,
          classRollNumber: String(data.classRollNumber || ""),
          phone: data.phone ? String(data.phone) : null,
          guardianEmail: data.guardianEmail ? String(data.guardianEmail).trim().toLowerCase() : null,
        },
        ...current,
      ]);
    } catch (err: unknown) {
      toast({ title: "Error", description: errorMessage(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = [
      "firstName,lastName,gender,campus,class,section,yearOfJoining,classRollNumber,phone",
      "Ali,Ahmad,MALE,Main Campus,Class 1,A,2026,001,03001234567",
      "Sara,Khan,FEMALE,Main Campus,Class 1,,2026,002,03007654321",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "students-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!importFile) {
      toast({ title: "Select a CSV file", description: "Choose a student import file first.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    setImportErrors([]);

    try {
      const uploadData = new FormData();
      uploadData.append("file", importFile);

      const response = await fetch("/api/institution/students/import", {
        method: "POST",
        body: uploadData,
      });
      const result = await response.json() as ImportStudentsResponse;

      if (!response.ok) {
        setImportErrors(result.errors || []);
        throw new Error(result.error || "Could not import students");
      }

      toast({
        title: "Students Imported",
        description: `${result.imported || 0} students imported. Initial password: ${result.initialPassword || "1234567890"}`,
        variant: "success",
      });
      setImportFile(null);
      setIsImportOpen(false);
      // Bulk import returns only a count — refresh to load the new page of rows.
      router.refresh();
    } catch (err: unknown) {
      toast({ title: "Import failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editStudent) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    
    try {
      await api.patch(`/api/institution/students/${editStudent.id}`, data);
      toast({ title: "Student Updated", variant: "success" });
      setRows((current) => current.map((student) => (
        student.id === editStudent.id
          ? {
              ...student,
              name: String(data.name || student.name),
              classId: Number(data.classId) || student.classId,
              sectionId: Number(data.sectionId) || student.sectionId,
              classRollNumber: String(data.classRollNumber || student.classRollNumber),
              phone: data.phone !== undefined ? (data.phone ? String(data.phone) : null) : student.phone,
              guardianEmail: data.guardianEmail !== undefined ? (data.guardianEmail ? String(data.guardianEmail).trim().toLowerCase() : null) : student.guardianEmail,
            }
          : student
      )));
      setEditStudent(null);
    } catch (err: unknown) {
      toast({ title: "Error", description: errorMessage(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteStudent) return;
    try {
      await api.delete(`/api/institution/students/${deleteStudent.id}`);
      toast({ title: "Student Deleted", variant: "success" });
      setRows((current) => current.filter((student) => student.id !== deleteStudent.id));
      setDeleteStudent(null);
    } catch (err: unknown) {
      toast({ title: "Error", description: errorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Students</h1>
          <p className="text-stone-500 mt-1">Manage all enrolled students across campuses.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setImportStep("guide");
              setIsImportOpen(true);
            }}
          >
            <Upload className="h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 bg-brand-800 hover:bg-brand-900 text-white">
            <Plus className="h-4 w-4" />
            Add Student
          </Button>
        </div>
      </div>

      <Card className="p-4 flex gap-4 flex-wrap bg-stone-50/50">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-stone-500 uppercase">Filter by Class</label>
          <select 
            className="w-full h-10 rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring"
            value={filterClassId}
            onChange={(e) => { setFilterClassId(e.target.value); setFilterSectionId(""); }}
          >
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-stone-500 uppercase">Filter by Section</label>
          <select 
            className="w-full h-10 rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring"
            value={filterSectionId}
            onChange={(e) => setFilterSectionId(e.target.value)}
            disabled={!filterClassId}
          >
            <option value="">All Sections</option>
            {mainFilteredSections.filter((s) => displaySectionName(s.name)).map(s => <option key={s.id} value={s.id}>{displaySectionName(s.name)}</option>)}
          </select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <DataTable 
          data={tableData} 
          columns={columns} 
          searchKey="searchString" 
          searchPlaceholder="Search students by name or roll number..."
          pageSize={rowsPerPage}
        />
        {totalCount !== undefined && page !== undefined && limit !== undefined && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-stone-500">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} results
            </div>
            <div className="flex gap-2 self-stretch sm:self-auto">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page <= 1} 
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("page", String(page - 1));
                  router.push(url.pathname + url.search);
                }}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page * limit >= totalCount} 
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("page", String(page + 1));
                  router.push(url.pathname + url.search);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* IMPORT MODAL */}
      <Dialog open={isImportOpen} onOpenChange={(open) => {
        setIsImportOpen(open);
        if (!open) {
          setImportStep("guide");
          setImportFile(null);
          setImportErrors([]);
        }
      }}>
        <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] overflow-y-auto p-0 sm:max-w-[900px]">
          <div className="border-b border-border px-5 py-4 sm:px-7">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Bulk Import Students</DialogTitle>
              <p className="text-sm text-stone-500">Import multiple students at once via CSV</p>
            </DialogHeader>
          </div>

          {importStep === "guide" ? (
            <>
              <div className="grid gap-0 px-5 py-5 sm:px-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_210px]">
                <div className="pb-4 lg:pb-0 lg:pr-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">CSV Columns</p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-stone-700 sm:grid-cols-3 lg:grid-cols-2">
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">firstName</code>
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">lastName</code>
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">gender</code>
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">campus</code>
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">class</code>
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">yearOfJoining</code>
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">classRollNumber</code>
                    <code className="rounded bg-brand-50 px-1.5 py-1 font-mono">phone</code>
                    <code className="rounded bg-stone-100 px-1.5 py-1 font-mono text-stone-500">
                      section <span className="font-sans text-[10px]">optional</span>
                    </code>
                  </div>
                </div>

                <div className="border-t border-border py-4 lg:border-l lg:border-t-0 lg:px-5 lg:py-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Rules</p>
                  <div className="mt-3 space-y-2 text-sm leading-5 text-stone-700">
                    <p>
                      Campus, class, and section names need an <strong className="font-semibold text-brand-950">exact match</strong> with what exists in the system.
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-600">
                      <code className="rounded bg-stone-100 px-1.5 py-1 font-mono">Created: Class 6</code>
                      <code className="rounded bg-stone-100 px-1.5 py-1 font-mono">CSV: Class 6</code>
                    </div>
                    <p>
                      Gender must be <strong className="font-semibold text-brand-950">MALE</strong>, <strong className="font-semibold text-brand-950">FEMALE</strong>, or <strong className="font-semibold text-brand-950">OTHER</strong>. Leave section empty for whole-class enrollment.
                    </p>
                    <div className="flex gap-2 border-l-2 border-red-400 pl-3 text-xs leading-5 text-red-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Mistyping campus, class, or section can cause mutation in data or make import fail.</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <FileText className="h-5 w-5 text-brand-800" />
                  <p className="mt-2 text-sm font-semibold text-brand-950">Template</p>
                  <p className="mt-1 text-xs leading-4 text-stone-500">Keep the header row unchanged.</p>
                  <Button type="button" variant="outline" onClick={handleDownloadTemplate} className="mt-3 w-full">
                    Download CSV
                  </Button>
                  <p className="mt-2 text-[11px] text-stone-400">students_template.csv · 2KB</p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setImportErrors([]);
                    setImportStep("upload");
                  }}
                  className="bg-brand-800 text-white transition-shadow hover:bg-brand-900 hover:shadow-md sm:min-w-[150px]"
                >
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={handleImport}>
              <div className="grid gap-0 px-5 py-5 sm:px-7 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="grid gap-3 pb-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-1 md:pb-0 md:pr-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-stone-700">CSV File</label>
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                      required
                    />
                  </div>

                  <div className="border-l-2 border-brand-200 pl-3 text-sm leading-5 text-stone-600">
                    Upload the completed CSV. Students will be created immediately after import succeeds.
                  </div>

                  {importErrors.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2 md:col-span-1">
                      <p className="mb-2 font-semibold">Fix these rows and upload again:</p>
                      <ul className="space-y-1">
                        {importErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                  <FileText className="h-5 w-5 text-brand-800" />
                  <p className="text-sm font-semibold text-brand-950">Need template?</p>
                  <p className="mt-1 text-xs leading-4 text-stone-500">
                    You can still download the sample CSV before uploading.
                  </p>
                  <Button type="button" variant="outline" onClick={handleDownloadTemplate} className="mt-3 w-full">
                    Download CSV
                  </Button>
                  <p className="mt-2 text-[11px] text-stone-400">students_template.csv · 2KB</p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <Button type="button" variant="outline" onClick={() => setImportStep("guide")} disabled={isSubmitting}>
                  Back
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-brand-800 text-white transition-shadow hover:bg-brand-900 hover:shadow-md sm:min-w-[150px]">
                  {isSubmitting ? "Importing..." : "Create Students"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* CREATE MODAL */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-[820px]">
          <div className="border-b border-border px-6 py-5">
            <DialogHeader>
              <DialogTitle>Add Student</DialogTitle>
            </DialogHeader>
          </div>

          <form onSubmit={handleCreate}>
            <div className="grid gap-x-5 gap-y-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">First Name</label>
                <Input name="firstName" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Last Name</label>
                <Input name="lastName" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Gender</label>
                <select name="gender" className="h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring">
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Campus</label>
                <select name="campusId" required className="h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring" disabled={campusesLoading || !campuses?.length}>
                  <option value="">{campusesLoading ? "Loading campuses…" : "Select Campus"}</option>
                  {(campuses || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Class</label>
                <select
                  name="classId"
                  required
                  className="h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring"
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                >
                  <option value="">Select Class</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Section</label>
                <select name="sectionId" className="h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring">
                  <option value=""></option>
                  {createFilteredSections.map(s => (
                    <option key={s.id} value={s.id}>{displaySectionName(s.name)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Year</label>
                <Input type="number" name="yearOfJoining" defaultValue={new Date().getFullYear()} required min={2000} max={2100} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Class Roll Number</label>
                <Input name="classRollNumber" required placeholder="e.g. 001" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Phone</label>
                <Input name="phone" placeholder="Optional" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-stone-700">Guardian email</label>
                <Input type="email" name="guardianEmail" placeholder="parent@example.com" />
                <p className="text-xs text-stone-500">This becomes the parent account email. Reusing it links siblings to one parent.</p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-border bg-stone-50 px-6 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-brand-800 text-white hover:bg-brand-900 sm:min-w-[180px]">
                {isSubmitting ? "Creating..." : "Create Student"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT MODAL */}
      <Dialog open={!!editStudent} onOpenChange={(open) => !open && setEditStudent(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          {editStudent && (
            <form onSubmit={handleEdit} className="space-y-4 mt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Full Name</label>
                <Input name="name" defaultValue={editStudent.name} required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Class</label>
                  <select name="classId" defaultValue={editStudent.classId} className="w-full h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring">
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Section</label>
                  <select name="sectionId" defaultValue={editStudent.sectionId} className="w-full h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring">
                    {sections.map(s => <option key={s.id} value={s.id}>{displaySectionName(s.name)}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Class Roll Number</label>
                <Input name="classRollNumber" defaultValue={editStudent.classRollNumber} required />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Phone</label>
                <Input name="phone" defaultValue={editStudent.phone || ''} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Guardian email</label>
                <Input type="email" name="guardianEmail" defaultValue={editStudent.guardianEmail || ''} placeholder="parent@example.com" />
                <p className="text-xs leading-relaxed text-stone-500">Only the institution can change this. The same email automatically groups siblings under one parent account.</p>
              </div>
              
              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={isSubmitting} className="bg-brand-800 hover:bg-brand-900 text-white w-full">
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE MODAL */}
      <Dialog open={!!deleteStudent} onOpenChange={(open) => !open && setDeleteStudent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Student</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to permanently delete <strong>{deleteStudent?.name}</strong>?</p>
            <p className="text-sm text-red-600 mt-2">This action cannot be undone and will remove all their records, marks, and logins.</p>
          </div>
          <div className="mt-4 flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setDeleteStudent(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Yes, Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
