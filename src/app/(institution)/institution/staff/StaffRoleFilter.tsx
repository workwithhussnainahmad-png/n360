"use client";

import { useRouter } from "next/navigation";

export function StaffRoleFilter({ roles, value }: { roles: Array<{ id: number; name: string }>; value: string }) {
  const router = useRouter();
  return (
    <label className="flex min-w-56 flex-col gap-1.5 text-left">
      <span className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Filter by role</span>
      <select
        value={value}
        onChange={(event) => {
          const role = event.target.value;
          router.push(role === "all" ? "/institution/staff" : `/institution/staff?role=${encodeURIComponent(role)}`);
        }}
        className="h-10 rounded-md border border-border bg-white px-3 text-sm font-medium text-brand-950"
      >
        <option value="all">All roles</option>
        {roles.map((role) => <option key={role.id} value={String(role.id)}>{role.name}</option>)}
        <option value="unassigned">Unassigned</option>
      </select>
    </label>
  );
}
