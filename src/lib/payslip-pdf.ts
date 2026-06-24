import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PayslipData = {
  school: { name: string; address?: string | null; phone?: string | null; logo_url?: string | null };
  staff: { employee_no: string; full_name: string; position?: string | null; bank_account?: string | null; bank_name?: string | null; national_id?: string | null; kra_pin?: string | null };
  period_label: string;
  gross: number;
  deductions: Array<{ label: string; amount: number }>;
  net: number;
};

const FOREST: [number, number, number] = [30, 86, 64];
const SOFT: [number, number, number] = [110, 110, 110];

const fmt = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function downloadPayslipPdf(p: PayslipData) {
  const doc = new jsPDF({ unit: "pt", format: "a5", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text(p.school.name.toUpperCase(), W / 2, 36, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  if (p.school.address) doc.text(p.school.address, W / 2, 50, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...FOREST);
  doc.text(`PAYSLIP — ${p.period_label}`, W / 2, 70, { align: "center" });

  autoTable(doc, {
    startY: 84,
    body: [
      ["Employee", p.staff.full_name, "Emp. No.", p.staff.employee_no],
      ["Position", p.staff.position ?? "—", "ID No.", p.staff.national_id ?? "—"],
      ["KRA PIN", p.staff.kra_pin ?? "—", "Bank", `${p.staff.bank_name ?? "—"} / ${p.staff.bank_account ?? "—"}`],
    ],
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", textColor: SOFT, cellWidth: 70 }, 2: { fontStyle: "bold", textColor: SOFT, cellWidth: 70 } },
    margin: { left: 30, right: 30 },
  });

  let y = (doc as any).lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: y,
    head: [["Earning", "KES"]],
    body: [["Gross Salary", fmt(p.gross)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: "right", font: "courier" } },
    margin: { left: 30, right: 30 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    head: [["Deductions", "KES"]],
    body: p.deductions.length ? p.deductions.map((d) => [d.label, fmt(d.amount)]) : [["None", "0.00"]],
    foot: [["Total deductions", fmt(p.deductions.reduce((a, b) => a + b.amount, 0))]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [120, 30, 30], textColor: [255, 255, 255] },
    footStyles: { fillColor: [244, 241, 234], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", font: "courier" } },
    margin: { left: 30, right: 30 },
  });
  y = (doc as any).lastAutoTable.finalY + 14;
  doc.setFillColor(244, 241, 234);
  doc.rect(30, y, W - 60, 36, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text("NET PAY", 44, y + 22);
  doc.setFont("courier", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...FOREST);
  doc.text(`KES ${fmt(p.net)}`, W - 44, y + 24, { align: "right" });

  doc.save(`Payslip-${p.staff.employee_no}-${p.period_label.replace(/\s+/g, "_")}.pdf`);
}
