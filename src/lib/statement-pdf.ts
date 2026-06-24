import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type StatementData = {
  school: {
    name: string;
    code?: string | null;
    county?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    motto?: string | null;
    logo_url?: string | null;
    receipt_footer?: string | null;
  };
  student: {
    admission_no: string;
    full_name: string;
    class_label: string;
    is_boarder: boolean;
    guardian_name?: string | null;
    guardian_phone?: string | null;
  };
  term: { label: string; opening_balance: number };
  charges: Array<{ vote_head: string; fund: string; amount: number }>;
  payments: Array<{ paid_on: string; receipt_no: string; method: string; reference: string | null; amount: number }>;
  bursaries: Array<{ source: string; reference: string | null; amount: number }>;
  totals: { charges: number; payments: number; bursaries: number; balance: number };
};

const FOREST: [number, number, number] = [30, 86, 64];
const BRASS: [number, number, number] = [184, 146, 79];
const INK: [number, number, number] = [26, 26, 26];
const SOFT: [number, number, number] = [110, 110, 110];

const fmt = (n: number) =>
  n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function downloadStatementPdf(s: StatementData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let textX = 40;
  if (s.school.logo_url?.startsWith("data:image")) {
    try {
      const fmt2 = s.school.logo_url.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(s.school.logo_url, fmt2, 40, 30, 50, 50);
      textX = 100;
    } catch { /* ignore */ }
  }
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(s.school.name.toUpperCase(), textX, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SOFT);
  const meta = [s.school.county, s.school.address, s.school.phone, s.school.email].filter(Boolean).join(" · ");
  if (meta) doc.text(meta, textX, 64);
  if (s.school.motto) {
    doc.setFont("times", "italic");
    doc.text(`"${s.school.motto}"`, textX, 76);
  }

  doc.setDrawColor(...BRASS);
  doc.line(40, 92, W - 40, 92);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...FOREST);
  doc.text("STUDENT FEE STATEMENT", W / 2, 110, { align: "center" });

  // Student panel
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  autoTable(doc, {
    startY: 124,
    body: [
      ["Student", s.student.full_name, "Admission No.", s.student.admission_no],
      ["Class", s.student.class_label, "Type", s.student.is_boarder ? "Boarder" : "Day"],
      ["Guardian", s.student.guardian_name ?? "—", "Phone", s.student.guardian_phone ?? "—"],
      ["Term", s.term.label, "Opening balance", `KES ${fmt(s.term.opening_balance)}`],
    ],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", textColor: SOFT, cellWidth: 80 }, 2: { fontStyle: "bold", textColor: SOFT, cellWidth: 80 } },
    margin: { left: 40, right: 40 },
  });

  let y = (doc as any).lastAutoTable.finalY + 14;

  // Charges
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Term charges (fee structure)", 40, y);
  autoTable(doc, {
    startY: y + 6,
    head: [["Vote head", "Fund", "Amount (KES)"]],
    body: s.charges.map((c) => [c.vote_head, c.fund, fmt(c.amount)]),
    foot: [["Total charges", "", fmt(s.totals.charges)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255] },
    footStyles: { fillColor: [244, 241, 234], textColor: INK, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right", font: "courier" } },
    margin: { left: 40, right: 40 },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // Payments
  doc.setFont("helvetica", "bold");
  doc.text("Payments received", 40, y);
  autoTable(doc, {
    startY: y + 6,
    head: [["Date", "Receipt", "Method", "Reference", "Amount (KES)"]],
    body: s.payments.length
      ? s.payments.map((p) => [p.paid_on, p.receipt_no, p.method.toUpperCase().replace("_", " "), p.reference ?? "—", fmt(p.amount)])
      : [["—", "—", "—", "—", "0.00"]],
    foot: [["", "", "", "Total payments", fmt(s.totals.payments)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255] },
    footStyles: { fillColor: [244, 241, 234], textColor: INK, fontStyle: "bold" },
    columnStyles: { 4: { halign: "right", font: "courier" } },
    margin: { left: 40, right: 40 },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  if (s.bursaries.length) {
    doc.setFont("helvetica", "bold");
    doc.text("Bursaries applied", 40, y);
    autoTable(doc, {
      startY: y + 6,
      head: [["Source", "Reference", "Amount (KES)"]],
      body: s.bursaries.map((b) => [b.source, b.reference ?? "—", fmt(b.amount)]),
      foot: [["", "Total bursary", fmt(s.totals.bursaries)]],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: FOREST, textColor: [255, 255, 255] },
      footStyles: { fillColor: [244, 241, 234], textColor: INK, fontStyle: "bold" },
      columnStyles: { 2: { halign: "right", font: "courier" } },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // Final balance
  doc.setFillColor(244, 241, 234);
  doc.rect(40, y, W - 80, 50, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text("CLOSING BALANCE", 56, y + 22);
  doc.setFont("courier", "bold");
  doc.setFontSize(20);
  doc.setTextColor(s.totals.balance > 0 ? 184 : 30, s.totals.balance > 0 ? 30 : 86, s.totals.balance > 0 ? 30 : 64);
  doc.text(`KES ${fmt(s.totals.balance)}`, W - 56, y + 36, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(s.totals.balance > 0 ? "Amount owing" : s.totals.balance < 0 ? "Credit balance" : "Cleared", 56, y + 42);

  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(s.school.receipt_footer ?? `Statement generated ${new Date().toLocaleString("en-KE")}`, W / 2, H - 30, { align: "center" });

  doc.save(`Statement-${s.student.admission_no}-${s.term.label.replace(/\s+/g, "_")}.pdf`);
}
