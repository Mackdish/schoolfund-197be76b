import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { FileText, Download, Plus, CheckCircle2, Calendar } from "lucide-react";
import { downloadIpsasPdf, type IpsasPayload } from "@/lib/ipsas-pdf";
import { downloadIpsasExcel } from "@/lib/ipsas-excel";

export const Route = createFileRoute("/ipsas")({
  head: () => ({ meta: [
    { title: "IPSAS reports — EduTech" },
    { name: "description", content: "Prepare annual school IPSAS financial reports in EduTech." },
    { property: "og:title", content: "IPSAS reports — EduTech" },
    { property: "og:description", content: "Prepare annual school IPSAS financial reports in EduTech." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }
  ] }),
  component: () => <AppShell><IpsasPage /></AppShell>,
});

function IpsasPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();
  const [selectedFy, setSelectedFy] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  const fysQ = useQuery({
    queryKey: ["financial-years", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_years" as any)
        .select("*")
        .eq("school_id", schoolId)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const currentFy = (fysQ.data ?? []).find((f) => f.id === selectedFy) ?? (fysQ.data ?? []).find((f) => f.is_active) ?? (fysQ.data ?? [])[0];

  const reportQ = useQuery({
    queryKey: ["ipsas-payload", schoolId, currentFy?.id],
    enabled: !!currentFy,
    queryFn: () => buildPayload(schoolId, currentFy, school),
  });

  const closeFy = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("close_financial_year" as any, { _fy_id: currentFy.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Financial year closed"); qc.invalidateQueries({ queryKey: ["financial-years"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHead
        eyebrow="IPSAS Cash Basis · annual"
        title="IPSAS reports"
        sub="Auto-generated annual financial statements from live ledger data — replicates Ministry of Education template"
        right={
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]">
            <Plus className="h-3.5 w-3.5" /> Open new FY
          </button>
        }
      />

      <Panel title="Financial year">
        {fysQ.data?.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-ink-soft">
            <Calendar className="mx-auto h-6 w-6 opacity-50" />
            <div className="mt-2">No financial year defined yet. Open one to begin reporting.</div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <select value={currentFy?.id ?? ""} onChange={(e) => setSelectedFy(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
              {(fysQ.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>FY {f.label} ({f.starts_on} → {f.ends_on}) {f.is_closed ? "· closed" : f.is_active ? "· active" : ""}</option>
              ))}
            </select>
            {currentFy && !currentFy.is_closed && (
              <button onClick={() => { if (confirm(`Close FY ${currentFy.label}? Transactions in this period will be locked.`)) closeFy.mutate(); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-[13px] hover:bg-paper">
                <CheckCircle2 className="h-3.5 w-3.5" /> Close FY
              </button>
            )}
          </div>
        )}
      </Panel>

      {currentFy && reportQ.data && (
        <>
          <Panel title="Statement of Financial Performance"
            right={
              <div className="flex gap-2">
                <button onClick={() => downloadIpsasPdf(reportQ.data)} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#163F31]">
                  <FileText className="h-3.5 w-3.5" /> Full PDF
                </button>
                <button onClick={() => downloadIpsasExcel(reportQ.data!)} className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[12px] hover:bg-paper">
                  <Download className="h-3.5 w-3.5" /> Excel
                </button>
                <button onClick={() => window.print()} className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] hover:bg-paper">Print</button>
              </div>
            }
          >
            <TwoCol left={
              <SimpleTable title="Income" rows={reportQ.data.performance.income} total={reportQ.data.performance.income.reduce((a, b) => a + b.amount, 0)} />
            } right={
              <SimpleTable title="Expenses" rows={reportQ.data.performance.expenses} total={reportQ.data.performance.expenses.reduce((a, b) => a + b.amount, 0)} />
            }/>
            <div className="mt-4 rounded-md bg-forest-light px-4 py-3 text-right">
              <span className="text-[11.5px] uppercase tracking-wide text-ink-soft">Surplus / (Deficit) </span>
              <span className="ml-3 font-mono text-[18px] font-semibold text-forest">{kes(reportQ.data.performance.surplus)}</span>
            </div>
          </Panel>

          <Panel title="Statement of Financial Position">
            <TwoCol left={<SimpleTable title="Assets" rows={reportQ.data.position.assets} total={reportQ.data.position.assets.reduce((a, b) => a + b.amount, 0)} />}
              right={<SimpleTable title="Liabilities & Fund Balances" rows={reportQ.data.position.liabilities} total={reportQ.data.position.liabilities.reduce((a, b) => a + b.amount, 0)} />} />
          </Panel>

          <Panel title="Statement of Cash Flows">
            <div className="grid grid-cols-3 gap-4">
              <SimpleTable title="Operating" rows={reportQ.data.cashflows.operating} total={reportQ.data.cashflows.operating.reduce((a, b) => a + b.amount, 0)} />
              <SimpleTable title="Investing" rows={reportQ.data.cashflows.investing} total={reportQ.data.cashflows.investing.reduce((a, b) => a + b.amount, 0)} />
              <SimpleTable title="Financing" rows={reportQ.data.cashflows.financing} total={reportQ.data.cashflows.financing.reduce((a, b) => a + b.amount, 0)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
              <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Opening cash:</span> <span className="ml-2 font-mono">{kes(reportQ.data.cashflows.opening_cash)}</span></div>
              <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Closing cash:</span> <span className="ml-2 font-mono">{kes(reportQ.data.cashflows.closing_cash)}</span></div>
            </div>
          </Panel>

          <Panel title="Notes summary">
            <div className="grid grid-cols-4 gap-3 text-[12.5px]">
              <Stat label="Government capitation" value={kes(reportQ.data.notes.capitation)} />
              <Stat label="Fees received" value={kes(reportQ.data.notes.fees_received)} />
              <Stat label="Bursaries received" value={kes(reportQ.data.notes.bursaries)} />
              <Stat label="Receivables" value={kes(reportQ.data.notes.receivables)} />
            </div>
          </Panel>
        </>
      )}

      {showCreate && <CreateFyDialog schoolId={schoolId} onClose={() => setShowCreate(false)} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-mono text-[14px]">{value}</div>
    </div>
  );
}

function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{left}{right}</div>;
}

function SimpleTable({ title, rows, total }: { title: string; rows: { label: string; amount: number }[]; total: number }) {
  return (
    <div>
      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">{title}</div>
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line">
              <td className="py-1.5">{r.label}</td>
              <td className="py-1.5 text-right font-mono">{kes(r.amount)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={2} className="py-3 text-center text-ink-soft">No data</td></tr>}
          <tr className="bg-paper">
            <td className="py-2 font-semibold">Total</td>
            <td className="py-2 text-right font-mono font-semibold">{kes(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CreateFyDialog({ schoolId, onClose }: { schoolId: string; onClose: () => void }) {
  const today = new Date();
  const y = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const [label, setLabel] = useState(`${y}/${y + 1}`);
  const [start, setStart] = useState(`${y}-07-01`);
  const [end, setEnd] = useState(`${y + 1}-06-30`);
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("financial_years" as any).insert({
        school_id: schoolId, label, starts_on: start, ends_on: end, is_active: true,
      });
      if (error) throw error;
      // deactivate others
      await supabase.from("financial_years" as any).update({ is_active: false }).eq("school_id", schoolId).neq("label", label);
    },
    onSuccess: () => { toast.success(`FY ${label} opened`); qc.invalidateQueries({ queryKey: ["financial-years"] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-md bg-surface p-5 shadow-lg">
        <h3 className="mb-3 text-[15px] font-semibold">Open new financial year</h3>
        <div className="space-y-3">
          <label className="block text-[12px]">Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]" />
          </label>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <label>Starts on
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]" />
            </label>
            <label>Ends on
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]" />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Cancel</button>
          <button onClick={() => create.mutate()} disabled={create.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white">Open FY</button>
        </div>
      </div>
    </div>
  );
}

async function buildPayload(schoolId: string, fy: any, school: any): Promise<IpsasPayload> {
  const start = fy.starts_on, end = fy.ends_on;
  // Cashbook entries within FY → operating cash receipts & payments
  const { data: cb } = await supabase.from("cashbook_entries")
    .select("entry_date, receipts, payments, fund_id, funds(name)")
    .eq("school_id", schoolId).gte("entry_date", start).lte("entry_date", end);
  const { data: paymentsRaw } = await supabase.from("payments")
    .select("amount, paid_on").eq("school_id", schoolId).gte("paid_on", start).lte("paid_on", end).eq("status", "confirmed");
  const { data: vouchers } = await supabase.from("payment_vouchers")
    .select("amount, paid_on, fund_id, vote_head_id, vote_heads(name), funds(name)")
    .eq("school_id", schoolId).gte("paid_on", start).lte("paid_on", end).eq("status", "paid");
  const { data: bursaryAlloc } = await supabase.from("bursary_allocations")
    .select("amount, bursaries(source)").gte("created_at", start).lte("created_at", end + "T23:59:59");
  const { data: invs } = await supabase.from("invoices").select("balance, total_charges, total_paid").eq("school_id", schoolId);
  const { data: funds } = await supabase.from("funds").select("id, name, opening_balance").eq("school_id", schoolId);

  const fees_received = (paymentsRaw ?? []).reduce((a, b: any) => a + Number(b.amount), 0);
  const bursaries = (bursaryAlloc ?? []).reduce((a, b: any) => a + Number(b.amount), 0);
  // approximate capitation = bursaries with source 'capitation' (best-effort)
  const capitation = (bursaryAlloc ?? []).filter((b: any) => /capit/i.test(b.bursaries?.source ?? "")).reduce((a, b: any) => a + Number(b.amount), 0);

  const expensesByVote = new Map<string, number>();
  const expensesByFund = new Map<string, number>();
  for (const v of vouchers ?? []) {
    const k = v.vote_heads?.name ?? "Other expenses";
    expensesByVote.set(k, (expensesByVote.get(k) ?? 0) + Number(v.amount));
    const fk = v.funds?.name ?? "—";
    expensesByFund.set(fk, (expensesByFund.get(fk) ?? 0) + Number(v.amount));
  }

  const cashIn = (cb ?? []).reduce((a, b: any) => a + Number(b.receipts), 0);
  const cashOut = (cb ?? []).reduce((a, b: any) => a + Number(b.payments), 0);

  const receivables = (invs ?? []).reduce((a, b: any) => a + Math.max(0, Number(b.balance)), 0);
  const totalIncome = fees_received + bursaries + capitation;
  const totalExpenses = Array.from(expensesByVote.values()).reduce((a, b) => a + b, 0);
  const surplus = totalIncome - totalExpenses;

  const fundCashRows = (funds ?? []).map((f: any) => ({
    label: f.name,
    amount: Number(f.opening_balance) + ((cb ?? []).filter((c: any) => c.fund_id === f.id).reduce((a, b: any) => a + Number(b.receipts) - Number(b.payments), 0)),
  }));
  const cashTotal = fundCashRows.reduce((a, b) => a + b.amount, 0);
  const openingCash = (funds ?? []).reduce((a, b: any) => a + Number(b.opening_balance), 0);

  return {
    school: {
      name: school?.name ?? "School",
      code: school?.code, county: school?.county, address: school?.address,
      phone: school?.phone, email: school?.email, motto: school?.motto,
      logo_url: school?.logo_url,
    },
    fy: { label: fy.label, starts_on: fy.starts_on, ends_on: fy.ends_on },
    performance: {
      income: [
        { label: "Fees received from parents", amount: fees_received },
        { label: "Government capitation", amount: capitation },
        { label: "Bursary funds", amount: bursaries - capitation },
      ].filter((r) => r.amount !== 0 || true),
      expenses: Array.from(expensesByVote.entries()).map(([label, amount]) => ({ label, amount })),
      surplus,
    },
    position: {
      assets: [
        ...fundCashRows.map((f) => ({ label: `Cash & bank — ${f.label}`, amount: f.amount })),
        { label: "Fees receivable", amount: receivables },
      ],
      liabilities: [
        { label: "Accumulated fund balance", amount: cashTotal + receivables },
      ],
      net_assets: cashTotal + receivables,
    },
    changes: { opening: openingCash, surplus, transfers: 0, closing: openingCash + surplus },
    cashflows: {
      operating: [
        { label: "Receipts from parents / students", amount: fees_received },
        { label: "Bursaries & capitation", amount: bursaries },
        { label: "Payments to suppliers & staff", amount: -cashOut },
      ],
      investing: [],
      financing: [],
      opening_cash: openingCash,
      closing_cash: openingCash + cashIn - cashOut,
    },
    budget: {
      items: Array.from(expensesByVote.entries()).map(([label, actual]) => ({
        label, budget: 0, actual, variance: -actual,
      })),
    },
    notes: {
      capitation, fees_received, bursaries,
      expenses_by_fund: Array.from(expensesByFund.entries()).map(([label, amount]) => ({ label, amount })),
      receivables,
      payables: 0,
      cash_and_equivalents: fundCashRows,
    },
  };
}
