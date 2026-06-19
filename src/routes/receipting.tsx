import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { Check, Receipt } from "lucide-react";

export const Route = createFileRoute("/receipting")({
  head: () => ({ meta: [{ title: "Receipting — SomaFin" }] }),
  component: () => <AppShell><ReceiptingPage /></AppShell>,
});

const METHODS = [
  { v: "kcb", l: "KCB bank deposit" },
  { v: "mpesa", l: "M-Pesa paybill" },
  { v: "equity", l: "Equity bank" },
  { v: "cash", l: "Cash" },
  { v: "cheque", l: "Cheque" },
  { v: "bank_transfer", l: "Bank transfer" },
] as const;

function ReceiptingPage() {
  const { school, user } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();

  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState<string>("");
  const [fundId, setFundId] = useState<string>("");
  const [method, setMethod] = useState<typeof METHODS[number]["v"]>("kcb");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const studentsQ = useQuery({
    queryKey: ["students-lookup", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, admission_no, full_name, classes(form, stream)").eq("school_id", schoolId).eq("status", "active").order("admission_no");
      return (data ?? []) as any[];
    },
  });

  const fundsQ = useQuery({
    queryKey: ["funds", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("funds").select("id, code, name").eq("school_id", schoolId).order("code");
      return (data ?? []) as any[];
    },
  });

  const recentQ = useQuery({
    queryKey: ["recent-payments", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, receipt_no, amount, method, reference, paid_on, status, students(full_name, admission_no), funds(name)")
        .eq("school_id", schoolId).order("created_at", { ascending: false }).limit(15);
      return (data ?? []) as any[];
    },
  });

  const matches = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return (studentsQ.data ?? []).filter((s) => s.full_name.toLowerCase().includes(q) || s.admission_no.toLowerCase().includes(q)).slice(0, 6);
  }, [studentQuery, studentsQ.data]);

  const selectedStudent = (studentsQ.data ?? []).find((s) => s.id === studentId);

  // open invoice items for selected student to allocate against
  const openItemsQ = useQuery({
    queryKey: ["open-items", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoice_items")
        .select("id, amount, paid_amount, vote_head_id, invoice_id, vote_heads(name, fund_id), invoices!inner(school_id, student_id, term_id, balance, terms(year, term))")
        .eq("invoices.student_id", studentId);
      return ((data ?? []) as any[]).filter((it) => Number(it.amount) - Number(it.paid_amount) > 0);
    },
  });

  const record = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter an amount");
      if (!studentId) throw new Error("Pick a student");
      if (!fundId) throw new Error("Pick a fund");

      // receipt no
      const { data: maxRow } = await supabase.from("payments").select("receipt_no").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1);
      const seqMatch = maxRow?.[0]?.receipt_no?.match(/(\d+)$/);
      const nextSeq = seqMatch ? Number(seqMatch[1]) + 1 : 10001;
      const receipt_no = `RCT-${String(nextSeq).padStart(6, "0")}`;

      const { data: payment, error: pe } = await supabase.from("payments").insert({
        school_id: schoolId, student_id: studentId, fund_id: fundId,
        receipt_no, method, reference: reference || null, amount: amt,
        payer_name: payer || null, status: "confirmed", recorded_by: user?.id ?? null,
      }).select("id").single();
      if (pe) throw pe;

      // allocate FIFO across items in same fund first
      const items = (openItemsQ.data ?? []).slice().sort((a, b) => {
        const aSame = a.vote_heads?.fund_id === fundId ? 0 : 1;
        const bSame = b.vote_heads?.fund_id === fundId ? 0 : 1;
        return aSame - bSame;
      });
      let remaining = amt;
      const touchedInvoices = new Set<string>();
      for (const it of items) {
        if (remaining <= 0) break;
        const due = Number(it.amount) - Number(it.paid_amount);
        if (due <= 0) continue;
        const alloc = Math.min(due, remaining);
        await supabase.from("payment_allocations").insert({
          payment_id: payment.id, invoice_item_id: it.id, amount: alloc,
        });
        await supabase.from("invoice_items").update({ paid_amount: Number(it.paid_amount) + alloc }).eq("id", it.id);
        touchedInvoices.add(it.invoice_id);
        remaining -= alloc;
      }
      // recompute each touched invoice
      for (const invId of touchedInvoices) {
        const { data: items2 } = await supabase.from("invoice_items").select("amount, paid_amount").eq("invoice_id", invId);
        const charges = (items2 ?? []).reduce((a, b: any) => a + Number(b.amount), 0);
        const paid = (items2 ?? []).reduce((a, b: any) => a + Number(b.paid_amount), 0);
        const { data: inv } = await supabase.from("invoices").select("opening_balance, total_bursary").eq("id", invId).maybeSingle();
        const opening = Number(inv?.opening_balance ?? 0);
        const burs = Number(inv?.total_bursary ?? 0);
        const balance = opening + charges - paid - burs;
        const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "open";
        await supabase.from("invoices").update({ total_charges: charges, total_paid: paid, balance, status }).eq("id", invId);
      }
      return { receipt_no, remaining };
    },
    onSuccess: ({ receipt_no, remaining }) => {
      toast.success(`Receipt ${receipt_no} issued${remaining > 0 ? ` · ${kes(remaining)} unallocated (credit)` : ""}`);
      setAmount(""); setReference(""); setPayer(""); setConfirmOpen(false);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dueTotal = (openItemsQ.data ?? []).reduce((a, b: any) => a + (Number(b.amount) - Number(b.paid_amount)), 0);

  return (
    <>
      <PageHead eyebrow="KCB · M-Pesa · cash" title="Receipting" sub="Confirm and post payments against student term invoices" />

      <div className="grid grid-cols-[1fr_360px] gap-5">
        <Panel title="Record payment">
          <div className="space-y-3">
            <L label="Student">
              <div className="relative">
                <input
                  value={selectedStudent ? `${selectedStudent.full_name} · ${selectedStudent.admission_no}` : studentQuery}
                  onChange={(e) => { setStudentId(""); setStudentQuery(e.target.value); }}
                  placeholder="Type name or admission no"
                  className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-forest"
                />
                {matches.length > 0 && !studentId && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-md">
                    {matches.map((s) => (
                      <button key={s.id} type="button" onClick={() => { setStudentId(s.id); setStudentQuery(""); }}
                        className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-paper">
                        <span className="font-medium">{s.full_name}</span>
                        <span className="ml-2 font-mono text-[11.5px] text-ink-soft">{s.admission_no}</span>
                        {s.classes && <span className="ml-2 text-ink-soft">Form {s.classes.form}{s.classes.stream}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </L>

            <div className="grid grid-cols-2 gap-3">
              <L label="Fund">
                <select value={fundId} onChange={(e) => setFundId(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
                  <option value="">Choose…</option>
                  {(fundsQ.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </L>
              <L label="Method">
                <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
                  {METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </L>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <L label={method === "mpesa" ? "M-Pesa code" : method === "kcb" ? "Bank slip no" : "Reference"}>
                <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-forest font-mono" placeholder={method === "mpesa" ? "RKL84MT0PQ" : "44210/B/0091"} />
              </L>
              <L label="Amount (KES)">
                <input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-right font-mono text-[13px] outline-none focus:border-forest" />
              </L>
            </div>

            <L label="Payer name (optional)">
              <input value={payer} onChange={(e) => setPayer(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-forest" placeholder="Parent / guardian" />
            </L>

            <button
              disabled={!studentId || !fundId || !amount}
              onClick={() => setConfirmOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-forest px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-50"
            >
              <Receipt className="h-4 w-4" /> Confirm receipt
            </button>
          </div>
        </Panel>

        <Panel title="Outstanding">
          {!studentId && <p className="text-[12.5px] text-ink-soft">Pick a student to see open vote-head balances.</p>}
          {studentId && openItemsQ.isLoading && <p className="text-[12.5px] text-ink-soft">Loading…</p>}
          {studentId && !openItemsQ.isLoading && (
            <>
              <div className="mb-3 flex items-center justify-between text-[12.5px]">
                <span className="text-ink-soft">Total due</span>
                <span className="font-mono font-medium">{kes(dueTotal)}</span>
              </div>
              <div className="space-y-1.5">
                {(openItemsQ.data ?? []).map((it: any) => {
                  const due = Number(it.amount) - Number(it.paid_amount);
                  return (
                    <div key={it.id} className="flex items-center justify-between rounded border border-line bg-paper px-2.5 py-1.5 text-[12px]">
                      <span>{it.vote_heads?.name}<span className="ml-2 text-ink-soft">T{it.invoices?.terms?.term}/{it.invoices?.terms?.year}</span></span>
                      <span className="font-mono">{kes(due)}</span>
                    </div>
                  );
                })}
                {!openItemsQ.data?.length && <p className="text-[12.5px] text-ink-soft">No outstanding charges.</p>}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="mt-5">
        <Panel title="Recent receipts">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
                <tr className="border-b border-line">
                  <th className="py-2 px-2 text-left">Receipt</th>
                  <th className="px-2 text-left">Date</th>
                  <th className="px-2 text-left">Student</th>
                  <th className="px-2 text-left">Method</th>
                  <th className="px-2 text-left">Reference</th>
                  <th className="px-2 text-left">Fund</th>
                  <th className="px-2 text-right font-mono">Amount</th>
                  <th className="px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(recentQ.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-line">
                    <td className="py-2 px-2 font-mono text-[12px]">{p.receipt_no}</td>
                    <td className="px-2">{p.paid_on}</td>
                    <td className="px-2">{p.students?.full_name} <span className="font-mono text-[11.5px] text-ink-soft">{p.students?.admission_no}</span></td>
                    <td className="px-2 uppercase text-[11.5px]">{p.method}</td>
                    <td className="px-2 font-mono text-[11.5px] text-ink-soft">{p.reference ?? "—"}</td>
                    <td className="px-2">{p.funds?.name}</td>
                    <td className="px-2 text-right font-mono">{kes(p.amount)}</td>
                    <td className="px-2"><Pill kind={p.status === "confirmed" ? "ok" : p.status === "pending" ? "pending" : "arrears"}>{p.status}</Pill></td>
                  </tr>
                ))}
                {!recentQ.data?.length && (
                  <tr><td colSpan={8} className="py-8 text-center text-ink-soft">No receipts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Check className="h-4 w-4 text-forest" />Confirm receipt</DialogTitle>
            <DialogDescription>
              You are about to record <strong>{kes(Number(amount) || 0)}</strong> from {selectedStudent?.full_name} via <strong>{METHODS.find((m) => m.v === method)?.l}</strong>
              {reference ? <> (ref <span className="font-mono">{reference}</span>)</> : null}. The payment will be allocated to outstanding charges automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setConfirmOpen(false)} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Cancel</button>
            <button onClick={() => record.mutate()} disabled={record.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
              {record.isPending ? "Posting…" : "Post receipt"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>{children}</label>;
}
