"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Papa from "papaparse";
import { UploadCloud, CheckCircle2, AlertTriangle, AlertCircle, Download } from "lucide-react";

type ClassType = { id: number; name: string; level: number };
type SectionType = { id: number; classId: number; name: string };
type SubjectType = { id: number; name: string; code: string | null };

export function PublishResultsForm({
  classes,
  sections,
  subjects
}: {
  classes: ClassType[];
  sections: SectionType[];
  subjects: SubjectType[];
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("FINAL");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [file, setFile] = useState<File | null>(null);

  const [parsedData, setParsedData] = useState<any[]>([]);
  const [detectedSubjects, setDetectedSubjects] = useState<{name: string, subjectId: number}[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const availableSections = classId ? sections.filter(s => s.classId === Number(classId)) : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError("");
      setParsedData([]);
      setDetectedSubjects([]);
    }
  };

  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const downloadTemplate = async () => {
    if (!classId) return;
    setIsDownloadingTemplate(true);
    try {
      let url = `/api/institution/batch-exams/template?classId=${classId}`;
      if (sectionId) url += `&sectionId=${sectionId}`;
      const res = await fetch(url);
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to fetch template");
      
      const studentList = resData.students;
      const templateSubjects = resData.subjects;

      const csvData = studentList.map((s: any) => {
        const row: any = {
          "Student Name": s.name,
          "Roll Number": s.rollNumber,
        };
        templateSubjects.forEach((sub: string) => {
          row[sub] = "";
        });
        return row;
      });

      if (csvData.length === 0) {
        const row: any = {
          "Student Name": "",
          "Roll Number": "",
        };
        templateSubjects.forEach((sub: string) => {
          row[sub] = "";
        });
        csvData.push(row);
      }

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const className = classes.find(c => c.id === Number(classId))?.name || "Class";
      link.setAttribute("download", `${className}_Result_Template.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const processCSV = () => {
    if (!file) return;
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        if (data.length === 0) {
          setError("CSV is empty.");
          return;
        }

        // Detect columns. Assume 'Roll Number' exists.
        const keys = Object.keys(data[0]);
        const rollCol = keys.find(k => k.toLowerCase().includes("roll") || k.toLowerCase() === "rollnumber");
        
        if (!rollCol) {
          setError("Could not find a column containing 'Roll' or 'Roll Number'. Please check your CSV format.");
          return;
        }

        // Map remaining columns to subjects
        const subjectCols = keys.filter(k => k !== rollCol);
        const matchedSubjects: {name: string, subjectId: number}[] = [];
        const unmatchedCols: string[] = [];

        subjectCols.forEach(col => {
          const matched = subjects.find(s => s.name.toLowerCase() === col.toLowerCase() || s.code?.toLowerCase() === col.toLowerCase());
          if (matched) {
            matchedSubjects.push({ name: col, subjectId: matched.id });
          } else {
            unmatchedCols.push(col);
          }
        });

        if (matchedSubjects.length === 0) {
          setError(`No valid subjects found. Unmatched columns: ${unmatchedCols.join(", ")}`);
          return;
        }

        // Clean data mapping
        const cleanData = data.map(row => {
          const marks: Record<number, number> = {};
          matchedSubjects.forEach(sub => {
            const val = parseFloat(row[sub.name]);
            if (!isNaN(val)) marks[sub.subjectId] = val;
          });
          return {
            rollNumber: row[rollCol],
            marks
          };
        }).filter(r => r.rollNumber && Object.keys(r.marks).length > 0);

        setParsedData(cleanData);
        setDetectedSubjects(matchedSubjects);
        if (unmatchedCols.length > 0) {
          setError(`Warning: some columns were ignored: ${unmatchedCols.join(", ")}`);
        } else {
          setError("");
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
      }
    });
  };

  const submitResults = async () => {
    if (!title || !classId || parsedData.length === 0) {
      setError("Please fill all required fields and process the CSV.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payload = {
        title,
        type,
        classId: Number(classId),
        sectionId: sectionId ? Number(sectionId) : undefined,
        subjects: detectedSubjects.map(s => ({
          subjectId: s.subjectId,
          name: s.name,
          maxMarks: Number(maxMarks)
        })),
        studentMarks: parsedData
      };

      const res = await fetch("/api/institution/batch-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to publish");

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-green-900">Results Uploaded Successfully</h2>
          <p className="text-green-700 max-w-md">
            The batch results have been created. Subject teachers now have 6 hours to review, edit, and publish their subject marks.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">Upload Another</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exam Details</CardTitle>
        <CardDescription>Enter exam details and upload the CSV sheet containing the marks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Exam Title *</label>
            <input 
              type="text" 
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-transparent" 
              placeholder="e.g. Mid Term Exam 2026" 
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Max Marks (Per Subject) *</label>
            <input 
              type="number" 
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-transparent" 
              value={maxMarks}
              onChange={e => setMaxMarks(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Result Type *</label>
            <select className="w-full rounded-md border border-border px-3 py-2 text-sm bg-transparent" value={type} onChange={e => setType(e.target.value)}>
              <option value="MONTHLY">Monthly</option><option value="MID">Mid Term</option><option value="FINAL">Final Term</option><option value="PROMOTION">Promotion</option>
            </select>
            {type === "PROMOTION" && <p className="text-xs text-brand-700">Students will be auto-promoted after every subject teacher publishes their results.</p>}
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Class *</label>
            <select 
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-transparent"
              value={classId}
              onChange={e => { setClassId(e.target.value); setSectionId(""); }}
            >
              <option value="">Select a class...</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Section</label>
            <select 
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-transparent"
              value={sectionId}
              onChange={e => setSectionId(e.target.value)}
              disabled={!classId || availableSections.length === 0}
            >
              <option value="">{availableSections.length > 0 ? "Select a section..." : "No sections available"}</option>
              {availableSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-stone-700">CSV Upload</h3>
            {classId && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={downloadTemplate} 
                disabled={isDownloadingTemplate}
              >
                <Download className="mr-2 h-4 w-4" /> 
                {isDownloadingTemplate ? "Preparing..." : "Download CSV Template"}
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
            />
            <Button type="button" variant="outline" onClick={processCSV} disabled={!file}>
              <UploadCloud className="mr-2 h-4 w-4" />
              Process
            </Button>
          </div>
          
          <p className="text-xs text-stone-500 mt-2">
	            CSV must contain a column named &quot;Roll Number&quot;. Other columns should exactly match subject names or codes.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="mt-0.5">{error}</span>
          </div>
        )}

        {parsedData.length > 0 && (
          <div className="space-y-3 border border-border rounded-md p-4 bg-stone-50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-stone-800">CSV Processed Successfully</h4>
                <p className="text-sm text-stone-600">
                  Found {parsedData.length} students across {detectedSubjects.length} subjects.
                </p>
              </div>
              <Button type="button" onClick={submitResults} disabled={isSubmitting}>
                {isSubmitting ? "Uploading..." : "Publish to Teachers"}
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-2 mt-2">
              {detectedSubjects.map((s, i) => (
                <span key={i} className="inline-flex items-center rounded-md bg-brand-100 px-2 py-1 text-xs font-medium text-brand-700">
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
