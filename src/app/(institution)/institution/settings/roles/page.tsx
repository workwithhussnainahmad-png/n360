"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const PERMISSIONS = [
  { key: "students.read", label: "View student records" },
  { key: "students.manage", label: "Manage student records" },
  { key: "exams.read", label: "View exams and timetables" },
  { key: "exams.manage", label: "Create and manage exams" },
  { key: "marks.manage", label: "Enter and manage marks" },
  { key: "attendance.manage", label: "Manage attendance" },
  { key: "announcements.manage", label: "Send announcements" },
  { key: "staff.read", label: "View staff directory" },
  { key: "staff.manage", label: "Manage staff accounts" },
  { key: "settings.manage", label: "Manage institution settings" },
];

const ROLE_TEMPLATES = {
  Teacher: ["students.read", "exams.read", "marks.manage", "attendance.manage", "announcements.manage"],
  Clerk: ["students.read", "students.manage"],
  "Exam Coordinator": ["students.read", "exams.read", "exams.manage", "marks.manage"],
  Accountant: ["students.read"],
  "Vice Principal": ["students.read", "students.manage", "exams.read", "exams.manage", "marks.manage", "attendance.manage", "announcements.manage", "staff.read"],
  Principal: PERMISSIONS.map((permission) => permission.key),
} as const;

type Role = { id: number; name: string; permissions: string[] };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const load = (signal?: AbortSignal) =>
    fetch("/api/institution/roles", { signal })
      .then((response) => response.json())
      .then((data) => setRoles(data.roles || []))
      .catch((err) => { if (err?.name !== "AbortError") throw err; });
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  const selectTemplate = (roleName: keyof typeof ROLE_TEMPLATES) => {
    setName(roleName);
    setPermissions([...ROLE_TEMPLATES[roleName]]);
  };
  const create = async () => {
    const response = await fetch("/api/institution/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, permissions }) });
    const data = await response.json();
    if (response.ok) { setMessage(`${data.role.name} role created.`); setName(""); setPermissions([]); load(); }
    else setMessage(data.error || "Unable to create role.");
  };

  return <div className="max-w-4xl space-y-6 animate-fade-in">
    <div>
      <Link href="/institution/settings" className="mb-4 inline-flex items-center text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Settings
      </Link>
      <h1 className="text-3xl font-display font-bold text-brand-950">Staff Roles</h1>
      <p className="mt-1 text-stone-500">Create job roles, then select one when adding each staff member.</p>
    </div>
    <div className="rounded-xl border border-border bg-white p-6 space-y-5">
      <div><p className="text-sm font-medium text-stone-700">Start with a job role</p><div className="mt-2 flex flex-wrap gap-2">{Object.keys(ROLE_TEMPLATES).map((template) => <button key={template} type="button" className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-100" onClick={() => selectTemplate(template as keyof typeof ROLE_TEMPLATES)}>{template}</button>)}</div></div>
      <label className="block text-sm font-medium text-stone-700">Role name<input className="mt-2 w-full rounded border p-2" placeholder="e.g. Teacher" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div><p className="text-sm font-medium text-stone-700">Access for this role</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{PERMISSIONS.map((permission) => <label key={permission.key} className="flex items-start gap-2 rounded border border-border p-3 text-left text-sm leading-5"><input className="mt-0.5" type="checkbox" checked={permissions.includes(permission.key)} onChange={(event) => setPermissions(event.target.checked ? [...permissions, permission.key] : permissions.filter((item) => item !== permission.key))}/>{permission.label}</label>)}</div></div>
      <button className="rounded bg-brand-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40" disabled={!name.trim()} onClick={create}>Create role</button>{message && <p className="text-sm text-stone-600">{message}</p>}
    </div>
    <div className="space-y-2">{roles.map((role) => <div key={role.id} className="rounded border bg-white p-4"><p className="font-medium text-brand-950">{role.name}</p><p className="mt-1 text-sm text-stone-500">{role.permissions.length} access permission{role.permissions.length === 1 ? "" : "s"} configured</p></div>)}</div>
  </div>;
}
