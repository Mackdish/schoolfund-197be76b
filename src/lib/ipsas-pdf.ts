import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type IpsasPayload = {
  school: {
    name: string;
    code?: string | null;
    county?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    motto?: string | null;
    logo_url?: string | null;
  };
  fy: { label: string; starts_on: string; ends_on: string };
  performance: { income: Row[]; expenses: Row[]; surplus: number };
  position: { assets: Row[]; liabilities: Row[]; net_assets: number };
  changes: { opening: number; surplus: number; transfers: number; closing: number };
  cashflows: { operating: Row[]; investing: Row[]; financing: Row[]; opening_cash: number; closing_cash: number };
  budget: { items: Array<{ label: string; budget: number; actual: number; variance: number }> };
  notes: { capitation: number; fees_received: number; bursaries: number; expenses_by_fund: Row[]; receivables: number; payables: number; cash_and_equivalents: Row[] };
};
type Row = { label: string; amount: number };

const FOREST: [number, number, number] = [30, 86, 64];
const BRASS: [number, number, number] = [184, 146, 79];
const INK: [number, number, number] = [26, 26, 26];
const SOFT: [number, number, number] = [110, 110, 110];

const fmt = (n: number) =>
  n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function detectFormat(url: string): "PNG" | "JPEG" {
  return url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg") ? "JPEG" : "PNG";
}

function header(doc: jsPDF, school: IpsasPayload["school"], title: string, fy: string) {
  const W = doc.internal.pageSize.getWidth();
  let textX = 40;
  if (school.logo_url?.startsWith("data:image")) {
    try {
      doc.addImage(school.logo_url, detectFormat(school.logo_url), 40, 32, 44, 44);
      textX = 92;
    } catch { /* ignore */ }
  }
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(school.name.toUpperCase(), textX, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SOFT);
  const meta = [school.county, school.address, school.phone, school.email].filter(Boolean).join(" · ");
  if (meta) doc.text(meta, textX, 62);
  doc.text(`FY ${fy}`, textX, 72);

  doc.setDrawColor(...BRASS);
  doc.setLineWidth(0.8);
  doc.line(40, 88, W - 40, 88);

  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...FOREST);
  doc.text(title, W / 2, 106, { align: "center" });
}

function footer(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const page = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...SOFT);
  doc.text(
    "Annual Financial Report — IPSAS Cash Basis · auto-generated from ledger",
    40,
    H - 24,
  );
  doc.text(`Page ${page}`, W - 40, H - 24, { align: "right" });
}

function table(
  doc: jsPDF,
  startY: number,
  head: string[],
  rows: any[][],
  opts: { totalRow?: any[] } = {},
) {
  autoTable(doc, {
    startY,
    head: [head],
    body: opts.totalRow ? [...rows, opts.totalRow] : rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    columnStyles: { 1: { halign: "right", font: "courier" }, 2: { halign: "right", font: "courier" }, 3: { halign: "right", font: "courier" } },
    didParseCell: (data) => {
      if (opts.totalRow && data.row.index === rows.length) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [244, 241, 234];
      }
    },
    margin: { left: 40, right: 40 },
  });
}

function pageBreakIfNeeded(doc: jsPDF, currentY: number, needed = 100): number {
  const H = doc.internal.pageSize.getHeight();
  if (currentY + needed > H - 60) {
    footer(doc);
    doc.addPage();
    return 130;
  }
  return currentY;
}

export async function generateIpsasReport(p: IpsasPayload): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // === COVER PAGE ===
  doc.setFillColor(...FOREST);
  doc.rect(0, 0, W, 12, "F");
  doc.setFillColor(...BRASS);
  doc.rect(0, 12, W, 3, "F");

  if (p.school.logo_url?.startsWith("data:image")) {
    try {
      doc.addImage(p.school.logo_url, detectFormat(p.school.logo_url), W / 2 - 50, 120, 100, 100);
    } catch { /* ignore */ }
  }

  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text(p.school.name.toUpperCase(), W / 2, 270, { align: "center" });

  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.setTextColor(...SOFT);
  if (p.school.motto) doc.text(`"${p.school.motto}"`, W / 2, 290, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta: string[] = [];
  if (p.school.county) meta.push(`${p.school.county} County`);
  if (p.school.code) meta.push(`Reg. ${p.school.code}`);
  if (meta.length) doc.text(meta.join(" · "), W / 2, 310, { align: "center" });

  doc.setDrawColor(...BRASS);
  doc.setLineWidth(1);
  doc.line(W / 2 - 60, 340, W / 2 + 60, 340);

  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...FOREST);
  doc.text("ANNUAL FINANCIAL STATEMENTS", W / 2, 380, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(`For the Financial Year ${p.fy.label}`, W / 2, 405, { align: "center" });
  doc.text(`(${p.fy.starts_on}  to  ${p.fy.ends_on})`, W / 2, 422, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text("Prepared in accordance with IPSAS Cash Basis of Accounting", W / 2, 460, { align: "center" });
  doc.text("Issued by the Board of Management", W / 2, 476, { align: "center" });

  // Signature block
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(80, H - 180, 240, H - 180);
  doc.line(W - 240, H - 180, W - 80, H - 180);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text("PRINCIPAL", 160, H - 165, { align: "center" });
  doc.text("BOM CHAIRPERSON", W - 160, H - 165, { align: "center" });

  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString("en-KE")}`, W / 2, H - 40, { align: "center" });

  // === STATEMENT OF FINANCIAL PERFORMANCE ===
  doc.addPage();
  header(doc, p.school, "STATEMENT OF FINANCIAL PERFORMANCE", p.fy.label);
  let y = 130;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Income", 40, y);
  y += 4;
  const incomeTotal = p.performance.income.reduce((a, b) => a + b.amount, 0);
  table(doc, y + 4, ["Source", "KES"], p.performance.income.map((r) => [r.label, fmt(r.amount)]), {
    totalRow: ["Total Income", fmt(incomeTotal)],
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  doc.setFont("helvetica", "bold");
  doc.text("Expenses", 40, y);
  const expTotal = p.performance.expenses.reduce((a, b) => a + b.amount, 0);
  table(doc, y + 8, ["Vote head", "KES"], p.performance.expenses.map((r) => [r.label, fmt(r.amount)]), {
    totalRow: ["Total Expenses", fmt(expTotal)],
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...FOREST);
  doc.text(
    `Surplus / (Deficit) for the year:   KES ${fmt(p.performance.surplus)}`,
    W - 40,
    y,
    { align: "right" },
  );
  footer(doc);

  // === STATEMENT OF FINANCIAL POSITION ===
  doc.addPage();
  header(doc, p.school, "STATEMENT OF FINANCIAL POSITION", p.fy.label);
  y = 130;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Assets", 40, y);
  const assetsTotal = p.position.assets.reduce((a, b) => a + b.amount, 0);
  table(doc, y + 8, ["Description", "KES"], p.position.assets.map((r) => [r.label, fmt(r.amount)]), {
    totalRow: ["Total Assets", fmt(assetsTotal)],
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  doc.setFont("helvetica", "bold");
  doc.text("Liabilities & Fund Balances", 40, y);
  const liabTotal = p.position.liabilities.reduce((a, b) => a + b.amount, 0);
  table(doc, y + 8, ["Description", "KES"], p.position.liabilities.map((r) => [r.label, fmt(r.amount)]), {
    totalRow: ["Total Liabilities & Funds", fmt(liabTotal)],
  });
  footer(doc);

  // === STATEMENT OF CHANGES IN NET ASSETS ===
  doc.addPage();
  header(doc, p.school, "STATEMENT OF CHANGES IN NET ASSETS", p.fy.label);
  table(doc, 130, ["Description", "KES"], [
    ["Balance brought forward (1 July)", fmt(p.changes.opening)],
    ["Surplus / (Deficit) for the year", fmt(p.changes.surplus)],
    ["Transfers / adjustments", fmt(p.changes.transfers)],
  ], { totalRow: ["Balance carried forward (30 June)", fmt(p.changes.closing)] });
  footer(doc);

  // === STATEMENT OF CASH FLOWS ===
  doc.addPage();
  header(doc, p.school, "STATEMENT OF CASH FLOWS", p.fy.label);
  y = 130;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Cash flows from operating activities", 40, y);
  const op = p.cashflows.operating.reduce((a, b) => a + b.amount, 0);
  table(doc, y + 8, ["", "KES"], p.cashflows.operating.map((r) => [r.label, fmt(r.amount)]), {
    totalRow: ["Net cash from operating", fmt(op)],
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  doc.setFont("helvetica", "bold");
  doc.text("Cash flows from investing activities", 40, y);
  const inv = p.cashflows.investing.reduce((a, b) => a + b.amount, 0);
  table(doc, y + 8, ["", "KES"], p.cashflows.investing.map((r) => [r.label, fmt(r.amount)]), {
    totalRow: ["Net cash from investing", fmt(inv)],
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  doc.setFont("helvetica", "bold");
  doc.text("Cash flows from financing activities", 40, y);
  const fin = p.cashflows.financing.reduce((a, b) => a + b.amount, 0);
  table(doc, y + 8, ["", "KES"], p.cashflows.financing.map((r) => [r.label, fmt(r.amount)]), {
    totalRow: ["Net cash from financing", fmt(fin)],
  });
  y = (doc as any).lastAutoTable.finalY + 18;
  y = pageBreakIfNeeded(doc, y, 100);

  table(doc, y, ["", "KES"], [
    ["Cash and equivalents at beginning of year", fmt(p.cashflows.opening_cash)],
    ["Net change in cash and equivalents", fmt(op + inv + fin)],
  ], { totalRow: ["Cash and equivalents at end of year", fmt(p.cashflows.closing_cash)] });
  footer(doc);

  // === BUDGET vs ACTUAL ===
  doc.addPage();
  header(doc, p.school, "COMPARISON OF BUDGET AND ACTUAL AMOUNTS", p.fy.label);
  autoTable(doc, {
    startY: 130,
    head: [["Vote head", "Budget (KES)", "Actual (KES)", "Variance (KES)"]],
    body: p.budget.items.map((r) => [r.label, fmt(r.budget), fmt(r.actual), fmt(r.variance)]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right", font: "courier" },
      2: { halign: "right", font: "courier" },
      3: { halign: "right", font: "courier" },
    },
    margin: { left: 40, right: 40 },
  });
  footer(doc);

  // === NOTES ===
  doc.addPage();
  header(doc, p.school, "NOTES TO THE FINANCIAL STATEMENTS", p.fy.label);
  y = 130;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Note 1 — Revenue", 40, y);
  table(doc, y + 8, ["Source", "KES"], [
    ["Government capitation received", fmt(p.notes.capitation)],
    ["Fees received from parents", fmt(p.notes.fees_received)],
    ["Bursaries received", fmt(p.notes.bursaries)],
  ]);
  y = (doc as any).lastAutoTable.finalY + 14;
  y = pageBreakIfNeeded(doc, y, 160);

  doc.setFont("helvetica", "bold");
  doc.text("Note 2 — Expenses by fund", 40, y);
  table(doc, y + 8, ["Fund", "KES"], p.notes.expenses_by_fund.map((r) => [r.label, fmt(r.amount)]));
  y = (doc as any).lastAutoTable.finalY + 14;
  y = pageBreakIfNeeded(doc, y, 120);

  doc.setFont("helvetica", "bold");
  doc.text("Note 3 — Cash and bank balances", 40, y);
  table(doc, y + 8, ["Account", "KES"], p.notes.cash_and_equivalents.map((r) => [r.label, fmt(r.amount)]));
  y = (doc as any).lastAutoTable.finalY + 14;
  y = pageBreakIfNeeded(doc, y, 90);

  doc.setFont("helvetica", "bold");
  doc.text("Note 4 — Receivables and payables", 40, y);
  table(doc, y + 8, ["Description", "KES"], [
    ["Fees receivable (parents)", fmt(p.notes.receivables)],
    ["Payables (suppliers)", fmt(p.notes.payables)],
  ]);
  footer(doc);

  return doc.output("blob");
}

export async function downloadIpsasPdf(p: IpsasPayload) {
  const blob = await generateIpsasReport(p);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `IPSAS-${p.school.name.replace(/\s+/g, "_")}-FY${p.fy.label.replace("/", "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
