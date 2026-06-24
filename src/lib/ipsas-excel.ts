import * as XLSX from "xlsx";
import type { IpsasPayload } from "./ipsas-pdf";

function sheet(rows: any[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

export function downloadIpsasExcel(p: IpsasPayload) {
  const wb = XLSX.utils.book_new();
  const header = [[p.school.name.toUpperCase()], [`FY ${p.fy.label}  (${p.fy.starts_on} to ${p.fy.ends_on})`], []];

  // Performance
  const perf = [
    ...header,
    ["STATEMENT OF FINANCIAL PERFORMANCE"],
    [],
    ["INCOME", "KES"],
    ...p.performance.income.map((r) => [r.label, r.amount]),
    ["Total Income", p.performance.income.reduce((a, b) => a + b.amount, 0)],
    [],
    ["EXPENSES", "KES"],
    ...p.performance.expenses.map((r) => [r.label, r.amount]),
    ["Total Expenses", p.performance.expenses.reduce((a, b) => a + b.amount, 0)],
    [],
    ["Surplus / (Deficit)", p.performance.surplus],
  ];
  XLSX.utils.book_append_sheet(wb, sheet(perf), "Performance");

  // Position
  const pos = [
    ...header,
    ["STATEMENT OF FINANCIAL POSITION"],
    [],
    ["ASSETS", "KES"],
    ...p.position.assets.map((r) => [r.label, r.amount]),
    ["Total Assets", p.position.assets.reduce((a, b) => a + b.amount, 0)],
    [],
    ["LIABILITIES & FUND BALANCES", "KES"],
    ...p.position.liabilities.map((r) => [r.label, r.amount]),
    ["Total Liabilities & Funds", p.position.liabilities.reduce((a, b) => a + b.amount, 0)],
  ];
  XLSX.utils.book_append_sheet(wb, sheet(pos), "Position");

  // Changes in Net Assets
  XLSX.utils.book_append_sheet(wb, sheet([
    ...header,
    ["STATEMENT OF CHANGES IN NET ASSETS"],
    [],
    ["Description", "KES"],
    ["Balance b/f", p.changes.opening],
    ["Surplus / (Deficit)", p.changes.surplus],
    ["Transfers", p.changes.transfers],
    ["Balance c/f", p.changes.closing],
  ]), "Changes");

  // Cash flows
  const cf = [
    ...header,
    ["STATEMENT OF CASH FLOWS"],
    [],
    ["OPERATING ACTIVITIES", "KES"],
    ...p.cashflows.operating.map((r) => [r.label, r.amount]),
    [],
    ["INVESTING ACTIVITIES", "KES"],
    ...p.cashflows.investing.map((r) => [r.label, r.amount]),
    [],
    ["FINANCING ACTIVITIES", "KES"],
    ...p.cashflows.financing.map((r) => [r.label, r.amount]),
    [],
    ["Opening cash & equivalents", p.cashflows.opening_cash],
    ["Closing cash & equivalents", p.cashflows.closing_cash],
  ];
  XLSX.utils.book_append_sheet(wb, sheet(cf), "Cash Flows");

  // Budget vs Actual
  const bud = [
    ...header,
    ["BUDGET vs ACTUAL"],
    [],
    ["Vote head", "Budget", "Actual", "Variance"],
    ...p.budget.items.map((r) => [r.label, r.budget, r.actual, r.variance]),
  ];
  XLSX.utils.book_append_sheet(wb, sheet(bud), "Budget vs Actual");

  // Notes
  const notes = [
    ...header,
    ["NOTES TO THE FINANCIAL STATEMENTS"],
    [],
    ["Note 1 — Revenue", "KES"],
    ["Government capitation", p.notes.capitation],
    ["Fees received", p.notes.fees_received],
    ["Bursaries", p.notes.bursaries],
    [],
    ["Note 2 — Expenses by fund", "KES"],
    ...p.notes.expenses_by_fund.map((r) => [r.label, r.amount]),
    [],
    ["Note 3 — Cash and bank", "KES"],
    ...p.notes.cash_and_equivalents.map((r) => [r.label, r.amount]),
    [],
    ["Note 4 — Receivables & payables", "KES"],
    ["Fees receivable", p.notes.receivables],
    ["Payables", p.notes.payables],
  ];
  XLSX.utils.book_append_sheet(wb, sheet(notes), "Notes");

  XLSX.writeFile(wb, `IPSAS-${p.school.name.replace(/\s+/g, "_")}-FY${p.fy.label.replace("/", "-")}.xlsx`);
}
