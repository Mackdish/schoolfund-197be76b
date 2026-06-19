import { jsPDF } from "jspdf";

type Receipt = {
  receipt_no: string;
  paid_on: string;
  amount: number | string;
  method: string;
  reference?: string | null;
  status: string;
  payer_name?: string | null;
  students?: { full_name?: string; admission_no?: string } | null;
  funds?: { name?: string } | null;
};

type SchoolBranding = {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  code?: string | null;
  motto?: string | null;
  logo_url?: string | null;
  receipt_footer?: string | null;
};

const FOREST = [30, 86, 64] as [number, number, number];
const BRASS = [184, 146, 79] as [number, number, number];
const INK = [26, 26, 26] as [number, number, number];
const SOFT = [110, 110, 110] as [number, number, number];
const LINE = [213, 218, 211] as [number, number, number];
const PAPER = [244, 241, 234] as [number, number, number];

function detectImageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

export async function generateReceiptPdf(p: Receipt, school: SchoolBranding): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 56;
  const left = 56;
  const right = W - 56;

  // Logo (top-left if present)
  let textX = left;
  if (school.logo_url && school.logo_url.startsWith("data:image")) {
    try {
      doc.addImage(school.logo_url, detectImageFormat(school.logo_url), left, y - 6, 56, 56);
      textX = left + 68;
    } catch {
      /* ignore corrupt image */
    }
  }

  // School name + meta
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(school.name, textX, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  const metaParts = [school.address, school.phone, school.email, school.code ? `Reg ${school.code}` : ""].filter(Boolean);
  if (metaParts.length) doc.text(metaParts.join("  ·  "), textX, y + 22);
  if (school.motto) {
    doc.setFont("times", "italic");
    doc.text(`"${school.motto}"`, textX, y + 36);
  }

  // Seal top-right
  doc.setDrawColor(...BRASS);
  doc.setLineWidth(1.2);
  doc.circle(right - 22, y + 14, 22);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRASS);
  doc.text("SF", right - 22, y + 18, { align: "center" });

  y += 70;

  // Title bar
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.6);
  doc.line(left, y, right, y);
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...FOREST);
  doc.text("OFFICIAL RECEIPT", W / 2, y, { align: "center", charSpace: 3 });
  y += 10;
  doc.setDrawColor(...LINE);
  doc.line(left, y, right, y);
  y += 28;

  // Detail rows
  const rows: Array<[string, string]> = [
    ["Receipt No.", p.receipt_no],
    ["Date", p.paid_on],
    ["Received from", `${p.students?.full_name ?? p.payer_name ?? "—"}${p.students?.admission_no ? `  (${p.students.admission_no})` : ""}`],
    ["Fund", p.funds?.name ?? "—"],
    ["Payment method", String(p.method).replace("_", " ").toUpperCase()],
    ["Reference", p.reference ?? "—"],
    ["Status", String(p.status).toUpperCase()],
  ];

  doc.setFontSize(10.5);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SOFT);
    doc.text(label, left, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(String(value), right - (left + 160));
    doc.text(lines, left + 160, y);
    y += Math.max(18, lines.length * 14);
    doc.setDrawColor(...LINE);
    doc.setLineDashPattern([1, 2], 0);
    doc.line(left, y - 8, right, y - 8);
    doc.setLineDashPattern([], 0);
  }

  y += 14;

  // Amount block
  doc.setFillColor(...PAPER);
  doc.setDrawColor(...LINE);
  doc.rect(left, y, right - left, 56, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text("AMOUNT RECEIVED", left + 16, y + 22, { charSpace: 2 });
  doc.setFont("courier", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...FOREST);
  const amountStr = `KES ${Number(p.amount).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.text(amountStr, right - 16, y + 36, { align: "right" });

  y += 100;

  // Signature lines
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(left, y, left + 180, y);
  doc.line(right - 180, y, right, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text("Bursar's signature", left + 90, y + 14, { align: "center" });
  doc.text("School stamp", right - 90, y + 14, { align: "center" });

  // Footer
  const footer = school.receipt_footer?.trim() || "This is a computer-generated receipt · keep for your records";
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  const footerLines = doc.splitTextToSize(footer, right - left);
  doc.text(footerLines, W / 2, doc.internal.pageSize.getHeight() - 40, { align: "center" });

  return doc.output("blob");
}

export async function downloadReceiptPdf(p: Receipt, school: SchoolBranding) {
  const blob = await generateReceiptPdf(p, school);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.receipt_no}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
