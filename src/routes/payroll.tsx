import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { Plus, FileText, Send, Trash2, Pencil } from "lucide-react";
import { downloadPayslipPdf } from "@/lib/payslip-pdf";

export const Route = createFileRoute("/payroll")({
  head: () => ({ meta: [{ title: "Payroll — SomaFin" }] }),
  component: () => <AppShell><PayrollPage /></AppShell>,
});

function PayrollPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const runsQ = useQuery({
    queryKey: ["payroll-runs", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_runs" as any).select("*, funds(name)").eq("school_id", schoolId).order("period_month", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <>
      <PageHead eyebrow="Salaries" title="Payroll" sub="Monthly salary runs auto-posted to the cashbook and ledger"
        right={<button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]"><Plus className="h-3.5 w-3.5" /> New payroll run</button>}
      />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2 px-2 text-left">Run</th>
                <th className="px-2 text-left">Period</th>
                <th className="px-2 text-left">Fund</th>
                <th className="px-2 text-right">Gross</th>
                <th className="px-2 text-right">Deductions</th>
                <th className="px-2 text-right">Net</th>
                <th className="px-2">Status</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {(runsQ.data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="py-2 px-2 font-mono">{r.run_no}</td>
                  <td className="px-2">{new Date(r.period_month).toLocaleDateString("en-KE", { month: "long", year: "numeric" })}</td>
                  <td className="px-2">{r.funds?.name}</td>
                  <td className="px-2 text-right font-mono">{kes(r.total_gross)}</td>
                  <td className="px-2 text-right font-mono">{kes(r.total_deductions)}</td>
                  <td className="px-2 text-right font-mono">{kes(r.total_net)}</td>
                  <td className="px-2">{r.status === "posted" ? <Pill kind="ok">Posted</Pill> : r.status === "approved" ? <Pill kind="partial">Approved</Pill> : r.status === "cancelled" ? <Pill kind="arrears">Cancelled</Pill> : <Pill kind="credit">Draft</Pill>}</td>
                  <td className="px-2 text-right"><button onClick={() => setOpenRunId(r.id)} className="text-forest hover:underline text-[11.5px]">Open</button></td>
                </tr>
              ))}
              {!runsQ.data?.length && <tr><td colSpan={8} className="py-10 text-center text-ink-soft">No payroll runs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {showNew && <NewRunDialog schoolId={schoolId} onClose={() => setShowNew(false)} onOpenRun={(id) => { setShowNew(false); setOpenRunId(id); }} />}
      {openRunId && <RunDetailDialog schoolId={schoolId} runId={openRunId} onClose={() => setOpenRunId(null)} schoolMeta={school} />}
    </>
  );
}

function NewRunDialog({ schoolId, onClose, onOpenRun }: { schoolId: string; onClose: () => void; onOpenRun: (id: string) => void }) {
  const qc = useQueryClient();
  const today = new Date();
  const [period, setPeriod] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`);
  const [fundId, setFundId] = useState("");

  const fundsQ = useQuery({
    queryKey: ["funds-payroll", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("funds").select("id, code, name").eq("school_id", schoolId).order("code");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!fundId) throw new Error("Pick a fund");
      const { data: noData } = await supabase.rpc("next_payroll_no" as any, { _school_id: schoolId, _period: period });
      const staffRes = await supabase.from("staff" as any).select("id, gross_salary").eq("school_id", schoolId).eq("is_active", true);
      const staffList = (staffRes.data ?? []) as any[];
      const runRes = await supabase.from("payroll_runs" as any).insert({
        school_id: schoolId, period_month: period, fund_id: fundId, run_no: noData as unknown as string,
        total_gross: staffList.reduce((a, b: any) => a + Number(b.gross_salary), 0),
        total_net: staffList.reduce((a, b: any) => a + Number(b.gross_salary), 0),
      }).select("id").single();
      if (runRes.error) throw runRes.error;
      const run = runRes.data as any;
      if (staffList.length) {
        await supabase.from("payroll_lines" as any).insert(staffList.map((s: any) => ({
          payroll_run_id: run.id, staff_id: s.id, gross: Number(s.gross_salary), net: Number(s.gross_salary),
        })));
      }
      return run.id as string;
    },
    onSuccess: (id) => { toast.success("Payroll run created"); qc.invalidateQueries({ queryKey: ["payroll-runs"] }); onOpenRun(id); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New payroll run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-[12px]">Period (month)
            <input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(e.target.value + "-01")}
              className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]" />
          </label>
          <label className="block text-[12px]">Fund to charge
            <select value={fundId} onChange={(e) => setFundId(e.target.value)} className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
              <option value="">Choose…</option>
              {(fundsQ.data ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Cancel</button>
          <button onClick={() => create.mutate()} disabled={create.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white">Create</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunDetailDialog({ schoolId, runId, onClose, schoolMeta }: { schoolId: string; runId: string; onClose: () => void; schoolMeta: any }) {
  const qc = useQueryClient();
  const runQ = useQuery({
    queryKey: ["payroll-run", runId],
    queryFn: async () => {
      const { data } = await supabase.from("payroll_runs" as any).select("*, funds(name)").eq("id", runId).single();
      return data as any;
    },
  });
  const linesQ = useQuery({
    queryKey: ["payroll-lines", runId],
    queryFn: async () => {
      const { data } = await supabase.from("payroll_lines" as any).select("*, staff(employee_no, full_name, position, bank_account, bank_name, national_id, kra_pin)").eq("payroll_run_id", runId).order("created_at");
      return (data ?? []) as any[];
    },
  });

  const updateLine = useMutation({
    mutationFn: async ({ id, patch }: any) => {
      const { error } = await supabase.from("payroll_lines" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-lines", runId] }),
  });

  const recalcAndPost = useMutation({
    mutationFn: async () => {
      // recompute totals
      const total_gross = (linesQ.data ?? []).reduce((a, b: any) => a + Number(b.gross), 0);
      const total_deductions = (linesQ.data ?? []).reduce((a, b: any) => a + Number(b.total_deductions), 0);
      const total_net = total_gross - total_deductions;
      await supabase.from("payroll_runs" as any).update({ total_gross, total_deductions, total_net }).eq("id", runId);
      const { error } = await supabase.rpc("post_payroll_run" as any, { _run_id: runId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payroll posted — vouchers created"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!runQ.data) return null;
  const run = runQ.data;
  const isPosted = run.status === "posted";
  const totalGross = (linesQ.data ?? []).reduce((a, b: any) => a + Number(b.gross), 0);
  const totalDed = (linesQ.data ?? []).reduce((a, b: any) => a + Number(b.total_deductions), 0);
  const totalNet = totalGross - totalDed;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[920px]">
        <DialogHeader>
          <DialogTitle>{run.run_no} — {new Date(run.period_month).toLocaleDateString("en-KE", { month: "long", year: "numeric" })}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Gross</span><div className="mt-1 font-mono">{kes(totalGross)}</div></div>
          <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Deductions</span><div className="mt-1 font-mono">{kes(totalDed)}</div></div>
          <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Net</span><div className="mt-1 font-mono text-forest">{kes(totalNet)}</div></div>
        </div>
        <div className="mt-3 max-h-[420px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft sticky top-0 bg-surface">
              <tr className="border-b border-line">
                <th className="py-2 px-2 text-left">Employee</th>
                <th className="px-2 text-right">Gross</th>
                <th className="px-2 text-left">Deductions</th>
                <th className="px-2 text-right">Net</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {(linesQ.data ?? []).map((l) => (
                <LineRow key={l.id} line={l} disabled={isPosted} onSave={(patch) => updateLine.mutate({ id: l.id, patch })} onPayslip={() => downloadPayslipPdf({
                  school: { name: schoolMeta?.name ?? "School", address: schoolMeta?.address, phone: schoolMeta?.phone, logo_url: schoolMeta?.logo_url },
                  staff: l.staff,
                  period_label: new Date(run.period_month).toLocaleDateString("en-KE", { month: "long", year: "numeric" }),
                  gross: Number(l.gross), net: Number(l.net),
                  deductions: (l.deductions ?? []).map((d: any) => ({ label: d.label, amount: Number(d.amount) })),
                })} />
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="!justify-between">
          <div className="text-[11px] text-ink-soft">Posting creates one paid voucher per employee, debiting <strong>{run.funds?.name}</strong>.</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Close</button>
            {!isPosted && <button onClick={() => { if (confirm(`Post payroll for ${linesQ.data?.length} employees? Net ${kes(totalNet)}.`)) recalcAndPost.mutate(); }}
              className="inline-flex items-center gap-1.5 rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white"><Send className="h-3.5 w-3.5" /> Post payroll</button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineRow({ line, disabled, onSave, onPayslip }: { line: any; disabled: boolean; onSave: (patch: any) => void; onPayslip: () => void }) {
  const [gross, setGross] = useState<number>(Number(line.gross));
  const [deductions, setDeductions] = useState<any[]>(line.deductions ?? []);
  const [editing, setEditing] = useState(false);
  const totalDed = deductions.reduce((a, b) => a + Number(b.amount || 0), 0);
  const net = gross - totalDed;

  function save() {
    onSave({ gross, deductions, total_deductions: totalDed, net });
    setEditing(false);
  }

  return (
    <tr className="border-b border-line">
      <td className="py-1.5 px-2">
        <div className="font-medium">{line.staff?.full_name}</div>
        <div className="text-[10.5px] text-ink-soft font-mono">{line.staff?.employee_no} · {line.staff?.position ?? ""}</div>
      </td>
      <td className="px-2 text-right font-mono">
        {editing && !disabled ? <input type="number" value={gross} onChange={(e) => setGross(Number(e.target.value))} className="w-24 rounded border border-line-strong px-2 py-1 text-right text-[12px]" />
         : kes(gross)}
      </td>
      <td className="px-2 text-[11px]">
        {editing && !disabled ? (
          <div className="space-y-1">
            {deductions.map((d, i) => (
              <div key={i} className="flex gap-1">
                <input value={d.label} onChange={(e) => { const c = [...deductions]; c[i] = { ...c[i], label: e.target.value }; setDeductions(c); }}
                  placeholder="Label" className="flex-1 rounded border border-line-strong px-1.5 py-0.5 text-[11px]" />
                <input type="number" value={d.amount} onChange={(e) => { const c = [...deductions]; c[i] = { ...c[i], amount: Number(e.target.value) }; setDeductions(c); }}
                  className="w-20 rounded border border-line-strong px-1.5 py-0.5 text-right text-[11px]" />
                <button onClick={() => setDeductions(deductions.filter((_, j) => j !== i))} className="text-garnet"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
            <button onClick={() => setDeductions([...deductions, { label: "", amount: 0 }])} className="text-forest text-[11px]">+ add deduction</button>
          </div>
        ) : (
          deductions.length ? deductions.map((d: any) => `${d.label} ${kes(d.amount)}`).join(" · ") : <span className="text-ink-soft">None</span>
        )}
      </td>
      <td className="px-2 text-right font-mono font-medium">{kes(net)}</td>
      <td className="px-2 text-right">
        <div className="flex justify-end gap-1.5">
          {!disabled && (editing ? (
            <button onClick={save} className="text-forest text-[11px] underline">Save</button>
          ) : (
            <button onClick={() => setEditing(true)} title="Edit" className="text-ink-soft hover:text-forest"><Pencil className="h-3.5 w-3.5" /></button>
          ))}
          <button onClick={onPayslip} title="Payslip PDF" className="text-ink-soft hover:text-forest"><FileText className="h-3.5 w-3.5" /></button>
        </div>
      </td>
    </tr>
  );
}
