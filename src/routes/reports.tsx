import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { kes } from "@/lib/money";
import { exportReportPdf, exportReportXlsx, type ReportDoc } from "@/lib/exporters";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [
    { title: "Statutory reports — EduTech" },
    { name: "description", content: "Review and export school statutory financial reports in EduTech." },
    { property: "og:title", content: "Statutory reports — EduTech" },
    { property: "og:description", content: "Review and export school statutory financial reports in EduTech." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }
  ] }),
  component: () => (
    <AppShell>
      <ReportsPage />
    </AppShell>
  ),
});

type Tab = "ie" | "bs" | "tb" | "cb";

function ReportsPage() {
  const { school } = useAuth();
  const schoolId = school!.id;

  const [tab, setTab] = useState<Tab>("ie");
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [fundId, setFundId] = useState("");

  const fundsQ = useQuery({
    queryKey: ["funds", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funds")
        .select("id, code, name, opening_balance")
        .eq("school_id", schoolId)
        .order("code");
      return (data ?? []) as any[];
    },
  });

  // Pull all posted lines in period (capped) and aggregate client-side
  const linesQ = useQuery({
    queryKey: ["report-lines", schoolId, from, to, fundId],
    queryFn: async () => {
      let q = supabase
        .from("journal_lines")
        .select(
          "debit, credit, fund_id, accounts!inner(id, code, name, type, school_id), journal_entries!inner(school_id, entry_date, status)",
        )
        .eq("journal_entries.school_id", schoolId)
        .eq("journal_entries.status", "posted")
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to);
      if (fundId) q = q.eq("fund_id", fundId);
      const { data } = await q.limit(10000);
      return (data ?? []) as any[];
    },
  });

  // Inception-to-date for balance sheet (asset/liab/equity) up to `to`
  const itdQ = useQuery({
    queryKey: ["report-itd", schoolId, to, fundId],
    queryFn: async () => {
      let q = supabase
        .from("journal_lines")
        .select(
          "debit, credit, fund_id, accounts!inner(id, code, name, type, school_id), journal_entries!inner(school_id, entry_date, status)",
        )
        .eq("journal_entries.school_id", schoolId)
        .eq("journal_entries.status", "posted")
        .lte("journal_entries.entry_date", to);
      if (fundId) q = q.eq("fund_id", fundId);
      const { data } = await q.limit(10000);
      return (data ?? []) as any[];
    },
  });

  const ie = useMemo(() => aggregateByAccount(linesQ.data ?? []), [linesQ.data]);
  const itd = useMemo(() => aggregateByAccount(itdQ.data ?? []), [itdQ.data]);

  // Cashbook summary per fund (period)
  const cbQ = useQuery({
    queryKey: ["report-cb", schoolId, from, to, fundId],
    queryFn: async () => {
      let q = supabase
        .from("cashbook_entries")
        .select("fund_id, entry_date, receipts, payments")
        .eq("school_id", schoolId);
      if (fundId) q = q.eq("fund_id", fundId);
      const { data } = await q.limit(20000);
      return (data ?? []) as any[];
    },
  });

  const cashbookSummary = useMemo(() => {
    const funds = (fundsQ.data ?? []).filter((f) => !fundId || f.id === fundId);
    const all = cbQ.data ?? [];
    return funds.map((f) => {
      const open = Number(f.opening_balance ?? 0);
      let priorNet = 0,
        pReceipts = 0,
        pPayments = 0;
      for (const e of all) {
        if (e.fund_id !== f.id) continue;
        const r = Number(e.receipts ?? 0);
        const p = Number(e.payments ?? 0);
        if (e.entry_date < from) priorNet += r - p;
        else if (e.entry_date <= to) {
          pReceipts += r;
          pPayments += p;
        }
      }
      const opening = open + priorNet;
      return {
        id: f.id,
        code: f.code,
        name: f.name,
        opening,
        receipts: pReceipts,
        payments: pPayments,
        closing: opening + pReceipts - pPayments,
      };
    });
  }, [cbQ.data, fundsQ.data, fundId, from, to]);

  const incomeRows = ie.filter((r) => r.type === "income");
  const expenseRows = ie.filter((r) => r.type === "expense");
  const totalIncome = sum(incomeRows.map((r) => r.credit - r.debit));
  const totalExpense = sum(expenseRows.map((r) => r.debit - r.credit));
  const surplus = totalIncome - totalExpense;

  // Trial balance (as-at `to`)
  const tbRows = useMemo(() => {
    return itd.map((r) => {
      const net = r.debit - r.credit;
      const isDr = r.type === "asset" || r.type === "expense";
      const bal = isDr ? net : -net;
      return {
        code: r.code,
        name: r.name,
        type: r.type,
        debit: bal > 0 ? bal : 0,
        credit: bal < 0 ? -bal : 0,
      };
    });
  }, [itd]);
  const tbDebit = sum(tbRows.map((r) => r.debit));
  const tbCredit = sum(tbRows.map((r) => r.credit));

  const assets = itd
    .filter((r) => r.type === "asset")
    .map((r) => ({ ...r, balance: r.debit - r.credit }));
  const liabilities = itd
    .filter((r) => r.type === "liability")
    .map((r) => ({ ...r, balance: r.credit - r.debit }));
  const equityRows = itd
    .filter((r) => r.type === "equity")
    .map((r) => ({ ...r, balance: r.credit - r.debit }));
  const totalAssets = sum(assets.map((r) => r.balance));
  const totalLiab = sum(liabilities.map((r) => r.balance));
  const totalEquity = sum(equityRows.map((r) => r.balance));
  // Income - expense (period to `to`) flows into accumulated surplus
  const itdIncome = sum(itd.filter((r) => r.type === "income").map((r) => r.credit - r.debit));
  const itdExpense = sum(itd.filter((r) => r.type === "expense").map((r) => r.debit - r.credit));
  const accumulated = itdIncome - itdExpense;
  const totalLiabEquity = totalLiab + totalEquity + accumulated;

  const fundLabel = fundId ? fundsQ.data?.find((f) => f.id === fundId)?.name : "All funds";

  const ieDoc = (): ReportDoc => ({
    schoolName: school?.name ?? "",
    schoolCode: school?.code,
    reportTitle: "Statement of Income & Expenditure",
    subtitle: `${fundLabel} · ${from} to ${to}`,
    sections: [
      {
        title: "Income",
        columns: ["Code", "Account", "Amount (KES)"],
        rows: incomeRows.map((r) => [r.code, r.name, r.credit - r.debit]),
        totals: ["", "Total income", totalIncome],
      },
      {
        title: "Expenditure",
        columns: ["Code", "Account", "Amount (KES)"],
        rows: expenseRows.map((r) => [r.code, r.name, r.debit - r.credit]),
        totals: ["", "Total expenditure", totalExpense],
      },
      {
        title: "Net surplus / (deficit)",
        columns: ["", "", "Amount (KES)"],
        rows: [["", "Surplus for the period", surplus]],
      },
    ],
  });

  const bsDoc = (): ReportDoc => ({
    schoolName: school?.name ?? "",
    schoolCode: school?.code,
    reportTitle: "Statement of Financial Position",
    subtitle: `${fundLabel} · as at ${to}`,
    sections: [
      {
        title: "Assets",
        columns: ["Code", "Account", "Amount (KES)"],
        rows: assets.map((r) => [r.code, r.name, r.balance]),
        totals: ["", "Total assets", totalAssets],
      },
      {
        title: "Liabilities",
        columns: ["Code", "Account", "Amount (KES)"],
        rows: liabilities.length
          ? liabilities.map((r) => [r.code, r.name, r.balance])
          : [["—", "No liabilities", 0]],
        totals: ["", "Total liabilities", totalLiab],
      },
      {
        title: "Equity & accumulated surplus",
        columns: ["Code", "Account", "Amount (KES)"],
        rows: [
          ...equityRows.map((r) => [r.code, r.name, r.balance] as (string | number)[]),
          ["", "Accumulated surplus (to date)", accumulated],
        ],
        totals: ["", "Total equity", totalEquity + accumulated],
      },
      {
        title: "Balance check",
        columns: ["", "", "Amount (KES)"],
        rows: [
          ["", "Total assets", totalAssets],
          ["", "Total liabilities + equity", totalLiabEquity],
          ["", "Variance", totalAssets - totalLiabEquity],
        ],
      },
    ],
  });

  const tbDoc = (): ReportDoc => ({
    schoolName: school?.name ?? "",
    schoolCode: school?.code,
    reportTitle: "Trial Balance",
    subtitle: `${fundLabel} · as at ${to}`,
    sections: [
      {
        title: "Trial balance",
        columns: ["Code", "Account", "Type", "Debit (KES)", "Credit (KES)"],
        rows: tbRows.map((r) => [r.code, r.name, r.type, r.debit || "", r.credit || ""]),
        totals: ["", "Totals", "", tbDebit, tbCredit],
      },
    ],
  });

  const cbDoc = (): ReportDoc => ({
    schoolName: school?.name ?? "",
    schoolCode: school?.code,
    reportTitle: "Cashbook Summary",
    subtitle: `${fundLabel} · ${from} to ${to}`,
    sections: [
      {
        title: "Cashbook summary per fund",
        columns: ["Code", "Fund", "Opening (KES)", "Receipts (KES)", "Payments (KES)", "Closing (KES)"],
        rows: cashbookSummary.map((r) => [r.code, r.name, r.opening, r.receipts, r.payments, r.closing]),
        totals: [
          "",
          "Total",
          sum(cashbookSummary.map((r) => r.opening)),
          sum(cashbookSummary.map((r) => r.receipts)),
          sum(cashbookSummary.map((r) => r.payments)),
          sum(cashbookSummary.map((r) => r.closing)),
        ],
      },
    ],
  });

  const currentDoc = (): ReportDoc =>
    tab === "ie" ? ieDoc() : tab === "bs" ? bsDoc() : tab === "tb" ? tbDoc() : cbDoc();
  const exportPdf = () => {
    const doc = currentDoc();
    exportReportPdf(doc, `${slug(doc.reportTitle)}_${to}.pdf`);
  };
  const exportXlsx = () => {
    const doc = currentDoc();
    exportReportXlsx(doc, `${slug(doc.reportTitle)}_${to}.xlsx`);
  };

  return (
    <>
      <PageHead
        eyebrow="IPSAS · accrual derived"
        title="Statutory reports"
        sub="Income & Expenditure and Balance Sheet, exportable as PDF or Excel, filtered by school, period and fund."
      />

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded-md border border-line bg-paper p-0.5">
            {(
              [
                ["ie", "Income & expenditure"],
                ["bs", "Balance sheet"],
                ["tb", "Trial balance"],
                ["cb", "Cashbook summary"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k as Tab)}
                className={`rounded px-3 py-1.5 text-[12.5px] font-medium ${tab === k ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <F label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
              disabled={tab === "bs" || tab === "tb"}
            />
          </F>
          <F label={tab === "bs" || tab === "tb" ? "As at" : "To"}>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
            />
          </F>
          <F label="Fund">
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
            >
              <option value="">All funds</option>
              {(fundsQ.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </F>
          <div className="ml-auto flex gap-2">
            <button
              onClick={exportXlsx}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] hover:bg-paper"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </button>
            <button
              onClick={exportPdf}
              className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#163F31]"
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        </div>
      </Panel>

      {tab === "ie" && (
        <>
          <Panel title={`Income · ${from} → ${to}`}>
            <RowsTable rows={incomeRows} valueFn={(r) => r.credit - r.debit} total={totalIncome} totalLabel="Total income" />
          </Panel>
          <Panel title="Expenditure">
            <RowsTable rows={expenseRows} valueFn={(r) => r.debit - r.credit} total={totalExpense} totalLabel="Total expenditure" />
          </Panel>
          <Panel title="Surplus / (deficit) for the period">
            <div className="flex items-center justify-between rounded border border-line bg-paper px-4 py-3">
              <span className="text-[13px]">Net surplus</span>
              <span
                className={`font-mono text-[15px] font-medium ${surplus >= 0 ? "text-forest" : "text-garnet"}`}
              >
                {kes(surplus)}
              </span>
            </div>
          </Panel>
        </>
      )}

      {tab === "bs" && (
        <>
          <Panel title={`Assets · as at ${to}`}>
            <RowsTable rows={assets} valueFn={(r) => r.balance} total={totalAssets} totalLabel="Total assets" />
          </Panel>
          <Panel title="Liabilities">
            {liabilities.length ? (
              <RowsTable rows={liabilities} valueFn={(r) => r.balance} total={totalLiab} totalLabel="Total liabilities" />
            ) : (
              <p className="text-[12.5px] text-ink-soft">No liabilities recorded.</p>
            )}
          </Panel>
          <Panel title="Equity & accumulated surplus">
            <table className="w-full text-[12.5px]">
              <tbody>
                {equityRows.map((r) => (
                  <tr key={r.code} className="border-b border-line">
                    <td className="py-1.5 px-2 font-mono text-[11.5px] text-ink-soft">
                      {r.code}
                    </td>
                    <td className="px-2">{r.name}</td>
                    <td className="px-2 text-right font-mono">{kes(r.balance)}</td>
                  </tr>
                ))}
                <tr className="border-b border-line">
                  <td className="py-1.5 px-2 font-mono text-[11.5px] text-ink-soft">—</td>
                  <td className="px-2">Accumulated surplus (since inception)</td>
                  <td className="px-2 text-right font-mono">{kes(accumulated)}</td>
                </tr>
                <tr className="border-t-2 border-line-strong font-medium">
                  <td className="py-2 px-2" colSpan={2}>
                    Total equity
                  </td>
                  <td className="px-2 text-right font-mono">
                    {kes(totalEquity + accumulated)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Balance check">
            <div className="grid grid-cols-3 gap-3 text-[12.5px]">
              <Box label="Total assets" value={kes(totalAssets)} />
              <Box label="Total liab + equity" value={kes(totalLiabEquity)} />
              <Box
                label="Variance"
                value={kes(totalAssets - totalLiabEquity)}
                kind={Math.abs(totalAssets - totalLiabEquity) < 0.5 ? "ok" : "warn"}
              />
            </div>
          </Panel>
        </>
      )}

      {tab === "tb" && (
        <Panel title={`Trial balance · as at ${to}`}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                {["Code", "Account", "Type", "Debit", "Credit"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-2 py-2 text-[10.5px] font-medium uppercase tracking-wider text-ink-soft ${i >= 3 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tbRows.map((r) => (
                <tr key={r.code} className="border-b border-line">
                  <td className="py-1.5 px-2 font-mono text-[11.5px] text-ink-soft">{r.code}</td>
                  <td className="px-2">{r.name}</td>
                  <td className="px-2 capitalize text-ink-soft">{r.type}</td>
                  <td className="px-2 text-right font-mono">{r.debit ? kes(r.debit) : "—"}</td>
                  <td className="px-2 text-right font-mono">{r.credit ? kes(r.credit) : "—"}</td>
                </tr>
              ))}
              {!tbRows.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink-soft">
                    Nothing posted.
                  </td>
                </tr>
              )}
              {tbRows.length > 0 && (
                <tr className="border-t-2 border-line-strong font-medium">
                  <td className="py-2 px-2" colSpan={3}>
                    Totals
                  </td>
                  <td className="px-2 text-right font-mono">{kes(tbDebit)}</td>
                  <td className="px-2 text-right font-mono">{kes(tbCredit)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-3">
            <Box
              label="In balance"
              value={Math.abs(tbDebit - tbCredit) < 0.5 ? "Yes" : `Variance ${kes(tbDebit - tbCredit)}`}
              kind={Math.abs(tbDebit - tbCredit) < 0.5 ? "ok" : "warn"}
            />
          </div>
        </Panel>
      )}

      {tab === "cb" && (
        <Panel title={`Cashbook summary · ${from} → ${to}`}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                {["Code", "Fund", "Opening", "Receipts", "Payments", "Closing"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-2 py-2 text-[10.5px] font-medium uppercase tracking-wider text-ink-soft ${i >= 2 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cashbookSummary.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="py-1.5 px-2 font-mono text-[11.5px] text-ink-soft">{r.code}</td>
                  <td className="px-2">{r.name}</td>
                  <td className="px-2 text-right font-mono">{kes(r.opening)}</td>
                  <td className="px-2 text-right font-mono text-forest">{kes(r.receipts)}</td>
                  <td className="px-2 text-right font-mono text-garnet">{kes(r.payments)}</td>
                  <td className="px-2 text-right font-mono font-medium">{kes(r.closing)}</td>
                </tr>
              ))}
              {!cashbookSummary.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-ink-soft">
                    No cashbook activity.
                  </td>
                </tr>
              )}
              {cashbookSummary.length > 0 && (
                <tr className="border-t-2 border-line-strong font-medium">
                  <td className="py-2 px-2" colSpan={2}>
                    Total
                  </td>
                  <td className="px-2 text-right font-mono">{kes(sum(cashbookSummary.map((r) => r.opening)))}</td>
                  <td className="px-2 text-right font-mono">{kes(sum(cashbookSummary.map((r) => r.receipts)))}</td>
                  <td className="px-2 text-right font-mono">{kes(sum(cashbookSummary.map((r) => r.payments)))}</td>
                  <td className="px-2 text-right font-mono">{kes(sum(cashbookSummary.map((r) => r.closing)))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}

function RowsTable<T extends { code: string; name: string }>({
  rows,
  valueFn,
  total,
  totalLabel,
}: {
  rows: T[];
  valueFn: (r: T) => number;
  total: number;
  totalLabel: string;
}) {
  return (
    <table className="w-full text-[12.5px]">
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className="border-b border-line">
            <td className="py-1.5 px-2 font-mono text-[11.5px] text-ink-soft">{r.code}</td>
            <td className="px-2">{r.name}</td>
            <td className="px-2 text-right font-mono">{kes(valueFn(r))}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={3} className="py-6 text-center text-ink-soft">
              Nothing posted.
            </td>
          </tr>
        )}
        {rows.length > 0 && (
          <tr className="border-t-2 border-line-strong font-medium">
            <td className="py-2 px-2" colSpan={2}>
              {totalLabel}
            </td>
            <td className="px-2 text-right font-mono">{kes(total)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Box({ label, value, kind }: { label: string; value: string; kind?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div
        className={`mt-1 font-mono text-[14px] ${kind === "ok" ? "text-forest" : kind === "warn" ? "text-amber" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

type Agg = { code: string; name: string; type: string; debit: number; credit: number };

function aggregateByAccount(lines: any[]): Agg[] {
  const m = new Map<string, Agg>();
  for (const l of lines) {
    const a = l.accounts;
    const k = a.id;
    const cur = m.get(k) ?? { code: a.code, name: a.name, type: a.type, debit: 0, credit: 0 };
    cur.debit += Number(l.debit);
    cur.credit += Number(l.credit);
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function sum(arr: number[]) {
  return arr.reduce((s, n) => s + n, 0);
}
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
