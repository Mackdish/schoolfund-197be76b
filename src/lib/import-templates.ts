import * as XLSX from "xlsx";

export type EntityKind = "students" | "staff" | "suppliers" | "fee_structures" | "opening_balances";

const COLUMNS: Record<EntityKind, { headers: string[]; example: any[] }> = {
  students: {
    headers: ["admission_no", "full_name", "gender", "form", "stream", "is_boarder", "guardian_name", "guardian_phone", "guardian_relation", "national_id"],
    example: ["ADM-1001", "John Mwangi", "M", 1, "A", true, "Mary Mwangi", "0712345678", "Mother", ""],
  },
  staff: {
    headers: ["employee_no", "full_name", "position", "department", "employment_date", "national_id", "kra_pin", "phone", "email", "gross_salary", "bank_name", "bank_branch", "bank_account"],
    example: ["EMP-001", "Jane Doe", "Teacher", "Mathematics", "2020-01-15", "12345678", "A012345678B", "0712000000", "jane@example.com", 45000, "KCB", "Nairobi", "1100200300"],
  },
  suppliers: {
    headers: ["supplier_no", "name", "contact_person", "phone", "email", "address", "kra_pin", "bank_name", "bank_branch", "bank_account", "category", "opening_balance"],
    example: ["SUP-0001", "Acme Stationers Ltd", "Peter Mwangi", "0712345678", "info@acme.co.ke", "Nairobi", "P051234567A", "Equity", "Westlands", "0100200300", "Goods", 0],
  },
  fee_structures: {
    headers: ["form", "stream", "is_boarder", "vote_head_code", "amount", "term", "year"],
    example: [1, "A", true, "TUI", 18000, 1, 2026],
  },
  opening_balances: {
    headers: ["admission_no", "amount"],
    example: ["ADM-1001", 5500],
  },
};

export function downloadTemplate(kind: EntityKind) {
  const { headers, example } = COLUMNS[kind];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  XLSX.utils.book_append_sheet(wb, ws, kind);
  XLSX.writeFile(wb, `${kind}-template.xlsx`);
}

export async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
  if (!raw.length) return { headers: [], rows: [] };
  const headers = (raw[0] as string[]).map((h) => String(h).trim());
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as any[];
    if (!r || !r.length) continue;
    if (r.every((c) => c === "" || c == null)) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, j) => { obj[h] = r[j] ?? ""; });
    rows.push(obj);
  }
  return { headers, rows };
}

export function getTemplateColumns(kind: EntityKind) { return COLUMNS[kind].headers; }

export function downloadErrorReport(rows: Array<{ row: number; errors: string[] }>) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["Row", "Errors"], ...rows.map((r) => [r.row, r.errors.join("; ")])]);
  XLSX.utils.book_append_sheet(wb, ws, "errors");
  XLSX.writeFile(wb, `import-errors-${Date.now()}.xlsx`);
}
