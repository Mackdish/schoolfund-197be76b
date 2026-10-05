import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — EduTech" }] }),
  component: () => <AppShell><StaffPage /></AppShell>,
});

function StaffPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);

  const staffQ = useQuery({
    queryKey: ["staff", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff" as any).select("*").eq("school_id", schoolId).order("full_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff" as any).update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Staff archived"); qc.invalidateQueries({ queryKey: ["staff"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const totalPayroll = (staffQ.data ?? []).filter((s) => s.is_active).reduce((a, b: any) => a + Number(b.gross_salary), 0);

  return (
    <>
      <PageHead eyebrow="HR" title="Staff register" sub="Employee records and salary register feeding the payroll module"
        right={<button onClick={() => setEdit({})} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]"><Plus className="h-3.5 w-3.5" /> New staff</button>}
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total staff" value={String((staffQ.data ?? []).filter((s) => s.is_active).length)} />
        <Stat label="Monthly payroll" value={kes(totalPayroll)} />
        <Stat label="Avg. gross" value={kes(totalPayroll / Math.max(1, (staffQ.data ?? []).filter((s) => s.is_active).length))} />
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2 px-2 text-left">Emp. No.</th>
                <th className="px-2 text-left">Name</th>
                <th className="px-2 text-left">Position</th>
                <th className="px-2 text-left">Department</th>
                <th className="px-2 text-left">Phone</th>
                <th className="px-2 text-right">Gross salary</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {(staffQ.data ?? []).map((s) => (
                <tr key={s.id} className={`border-b border-line ${!s.is_active ? "opacity-50" : ""}`}>
                  <td className="py-2 px-2 font-mono text-[12px]">{s.employee_no}</td>
                  <td className="px-2 font-medium">{s.full_name}{s.national_id && <div className="text-[11px] text-ink-soft font-mono">ID {s.national_id}</div>}</td>
                  <td className="px-2">{s.position ?? "—"}</td>
                  <td className="px-2">{s.department ?? "—"}</td>
                  <td className="px-2 font-mono text-[11.5px]">{s.phone ?? "—"}</td>
                  <td className="px-2 text-right font-mono">{kes(s.gross_salary)}</td>
                  <td className="px-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setEdit(s)} title="Edit" className="text-ink-soft hover:text-forest"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm(`Archive ${s.full_name}?`)) del.mutate(s.id); }} title="Archive" className="text-ink-soft hover:text-garnet"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!staffQ.data?.length && <tr><td colSpan={7} className="py-10 text-center text-ink-soft"><Users className="mx-auto h-5 w-5 opacity-50" /><div className="mt-1">No staff yet. Add staff to enable payroll.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {edit && <StaffDialog schoolId={schoolId} staff={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line bg-surface px-4 py-3">
    <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
    <div className="mt-1 font-serif text-[20px]">{value}</div>
  </div>;
}

function StaffDialog({ schoolId, staff, onClose }: { schoolId: string; staff: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!staff?.id;
  const [f, setF] = useState({
    full_name: staff?.full_name ?? "",
    position: staff?.position ?? "",
    department: staff?.department ?? "",
    employment_date: staff?.employment_date ?? "",
    national_id: staff?.national_id ?? "",
    kra_pin: staff?.kra_pin ?? "",
    phone: staff?.phone ?? "",
    email: staff?.email ?? "",
    gross_salary: staff?.gross_salary ?? 0,
    bank_name: staff?.bank_name ?? "",
    bank_branch: staff?.bank_branch ?? "",
    bank_account: staff?.bank_account ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!f.full_name.trim()) throw new Error("Name required");
      const payload: any = { ...f, employment_date: f.employment_date || null };
      if (isEdit) {
        const { error } = await supabase.from("staff" as any).update(payload).eq("id", staff.id);
        if (error) throw error;
      } else {
        const { data: noData } = await supabase.rpc("next_employee_no" as any, { _school_id: schoolId });
        const { error } = await supabase.from("staff" as any).insert({ ...payload, school_id: schoolId, employee_no: noData as string });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["staff"] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader><DialogTitle>{isEdit ? "Edit staff" : "New staff"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name *" className="col-span-2"><input className="sf-input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Position"><input className="sf-input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
          <Field label="Department"><input className="sf-input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
          <Field label="Employment date"><input type="date" className="sf-input" value={f.employment_date} onChange={(e) => setF({ ...f, employment_date: e.target.value })} /></Field>
          <Field label="National ID"><input className="sf-input font-mono" value={f.national_id} onChange={(e) => setF({ ...f, national_id: e.target.value })} /></Field>
          <Field label="KRA PIN"><input className="sf-input font-mono" value={f.kra_pin} onChange={(e) => setF({ ...f, kra_pin: e.target.value })} /></Field>
          <Field label="Phone"><input className="sf-input font-mono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email" className="col-span-2"><input className="sf-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Gross salary (KES)" className="col-span-2"><input type="number" className="sf-input" value={f.gross_salary} onChange={(e) => setF({ ...f, gross_salary: Number(e.target.value) })} /></Field>
          <Field label="Bank"><input className="sf-input" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></Field>
          <Field label="Branch"><input className="sf-input" value={f.bank_branch} onChange={(e) => setF({ ...f, bank_branch: e.target.value })} /></Field>
          <Field label="Account no." className="col-span-2"><input className="sf-input font-mono" value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white">{save.isPending ? "Saving…" : isEdit ? "Save" : "Create"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className ?? ""}`}>
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
    {children}
  </label>;
}
