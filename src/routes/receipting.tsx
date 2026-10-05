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
import { Check, Receipt, Download, Printer, FileText } from "lucide-react";
import { downloadReceiptPdf } from "@/lib/receipt-pdf";

export const Route = createFileRoute("/receipting")({
  head: () => ({ meta: [{ title: "Receipting — EduTech" }] }),
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
                  <th className="px-2"></th>
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
                    <td className="px-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => printReceipt(p, school, "print")} title="Print" className="text-ink-soft hover:text-forest">
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const studentId = (p.students as any)?.id ?? (await supabase.from("payments").select("student_id").eq("id", p.id).maybeSingle()).data?.student_id;
                              let balance_info = null;
                              if (studentId) {
                                const { data: t } = await supabase.from("terms").select("id, term, year").eq("school_id", schoolId).eq("is_active", true).maybeSingle();
                                const invRes = await supabase.from("invoices").select("total_charges, total_paid, balance, terms(term, year)").eq("student_id", studentId).eq("term_id", t?.id ?? "").maybeSingle();
                                const inv: any = invRes.data;
                                if (inv) balance_info = { term_label: inv.terms ? `Term ${inv.terms.term} ${inv.terms.year}` : undefined, total_charges: Number(inv.total_charges), total_paid: Number(inv.total_paid ?? 0), outstanding: Number(inv.balance) };
                              }
                              await downloadReceiptPdf({ ...p, balance_info } as any, school as any);
                              toast.success(`Downloaded ${p.receipt_no}.pdf`);
                            }
                            catch (e: any) { toast.error(e.message || "PDF export failed"); }
                          }}
                          title="Download PDF"
                          className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10.5px] font-medium text-forest hover:bg-paper"
                        >
                          <FileText className="h-3 w-3" /> PDF
                        </button>
                        <button onClick={() => printReceipt(p, school, "download")} title="Download HTML" className="text-ink-soft hover:text-forest">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!recentQ.data?.length && (
                  <tr><td colSpan={9} className="py-8 text-center text-ink-soft">No receipts yet.</td></tr>
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

function receiptHtml(p: any, school: any) {
  const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c]);
  const amountWords = (() => {
    const n = Math.round(Number(p.amount));
    try { return n.toLocaleString("en-KE"); } catch { return String(n); }
  })();
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(p.receipt_no)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Georgia,'Times New Roman',serif;margin:0;padding:48px;color:#1a1a1a;background:#fff}
  .wrap{max-width:680px;margin:0 auto;border:1px solid #d5dad3;padding:36px 40px;position:relative}
  .seal{position:absolute;right:36px;top:32px;border:1.5px solid #B8924F;color:#B8924F;font-family:Georgia,serif;font-weight:600;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;letter-spacing:1px}
  h1{font-size:22px;margin:0 0 4px}
  .meta{font-size:12px;color:#666;margin-bottom:18px}
  h2{font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#1E5640;border-top:1px solid #d5dad3;border-bottom:1px solid #d5dad3;padding:10px 0;margin:24px 0 18px;text-align:center}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:7px 4px;border-bottom:1px dotted #d5dad3;vertical-align:top}
  .lab{color:#666;width:38%}
  .val{font-weight:500}
  .mono{font-family:'IBM Plex Mono',Menlo,monospace;font-size:12.5px}
  .amount{margin-top:28px;padding:14px 18px;background:#F4F1EA;border:1px solid #d5dad3;display:flex;justify-content:space-between;align-items:center}
  .amount .l{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#666}
  .amount .v{font-family:'IBM Plex Mono',Menlo,monospace;font-size:22px;font-weight:600;color:#1E5640}
  .sig{margin-top:48px;display:flex;justify-content:space-between;font-size:11px;color:#666}
  .sig div{border-top:1px solid #333;padding-top:6px;width:42%;text-align:center}
  .foot{margin-top:30px;text-align:center;font-size:10.5px;color:#999;letter-spacing:1px;text-transform:uppercase}
  @media print { body{padding:0} .wrap{border:none} }
</style></head><body>
<div class="wrap">
  <div class="seal">SF</div>
  <h1>${esc(school?.name ?? "School")}</h1>
  <div class="meta">${esc(school?.address ?? "")}${school?.phone ? " · " + esc(school.phone) : ""}${school?.code ? " · Reg " + esc(school.code) : ""}</div>
  <h2>Official Receipt</h2>
  <table>
    <tr><td class="lab">Receipt No.</td><td class="val mono">${esc(p.receipt_no)}</td></tr>
    <tr><td class="lab">Date</td><td class="val">${esc(p.paid_on)}</td></tr>
    <tr><td class="lab">Received from</td><td class="val">${esc(p.students?.full_name ?? p.payer_name ?? "—")}${p.students?.admission_no ? ` <span class="mono">(${esc(p.students.admission_no)})</span>` : ""}</td></tr>
    <tr><td class="lab">Fund</td><td class="val">${esc(p.funds?.name ?? "—")}</td></tr>
    <tr><td class="lab">Payment method</td><td class="val">${esc(String(p.method).replace("_", " ").toUpperCase())}</td></tr>
    <tr><td class="lab">Reference</td><td class="val mono">${esc(p.reference ?? "—")}</td></tr>
    <tr><td class="lab">Status</td><td class="val">${esc(String(p.status).toUpperCase())}</td></tr>
  </table>
  <div class="amount"><div class="l">Amount received</div><div class="v">KES ${amountWords}</div></div>
  <div class="sig"><div>Bursar's signature</div><div>School stamp</div></div>
  <div class="foot">This is a computer-generated receipt · keep for your records</div>
</div></body></html>`;
}

function printReceipt(p: any, school: any, mode: "print" | "download") {
  const html = receiptHtml(p, school);
  if (mode === "download") {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.receipt_no}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Downloaded ${p.receipt_no}.html — open and save as PDF for archive`);
    return;
  }
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) { toast.error("Pop-up blocked. Allow pop-ups to print receipts."); return; }
  w.document.write(html + "<script>setTimeout(()=>window.print(),250)</script>");
  w.document.close();
}
