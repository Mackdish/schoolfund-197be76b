import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Upload, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { downloadTemplate, parseFile, downloadErrorReport, type EntityKind } from "@/lib/import-templates";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "Bulk import — SomaFin" }] }),
  component: () => <AppShell><ImportPage /></AppShell>,
});

const TABS: { key: EntityKind; label: string; desc: string }[] = [
  { key: "students", label: "Students", desc: "Admission no, name, class, guardian details" },
  { key: "staff", label: "Staff", desc: "Employee no, position, salary, bank details" },
  { key: "suppliers", label: "Suppliers", desc: "Vendors with KRA PIN and bank info" },
  { key: "fee_structures", label: "Fee structures", desc: "Vote head amounts per class & term" },
  { key: "opening_balances", label: "Opening balances", desc: "Carry-forward student balances" },
];

function ImportPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const [tab, setTab] = useState<EntityKind>("students");
  const [parsed, setParsed] = useState<{ rows: Record<string, any>[]; fileName: string } | null>(null);
  const [validation, setValidation] = useState<{ ok: any[]; errors: { row: number; data: any; errors: string[] }[] } | null>(null);
  const qc = useQueryClient();

  const runsQ = useQuery({
    queryKey: ["import-runs", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("import_runs" as any).select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(10);
      return (data ?? []) as any[];
    },
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows } = await parseFile(file);
      setParsed({ rows, fileName: file.name });
      setValidation(await validate(tab, rows, schoolId));
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const doImport = useMutation({
    mutationFn: async () => {
      if (!validation) throw new Error("Parse a file first");
      const ok = await runImport(tab, validation.ok, schoolId);
      await supabase.from("import_runs" as any).insert({
        school_id: schoolId, entity: tab, file_name: parsed?.fileName ?? null,
        ok_count: ok, error_count: validation.errors.length,
        errors: validation.errors.slice(0, 50).map((e) => ({ row: e.row, errors: e.errors })),
      });
      return ok;
    },
    onSuccess: (n) => { toast.success(`Imported ${n} ${tab}`); setParsed(null); setValidation(null); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHead eyebrow="Onboarding" title="Bulk data import" sub="Upload Excel or CSV files to seed students, staff, suppliers, fee structures and opening balances" />

      <Panel>
        <div className="mb-4 flex flex-wrap gap-1.5 border-b border-line">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setParsed(null); setValidation(null); }}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${tab === t.key ? "border-forest text-forest font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_300px] gap-4">
          <div>
            <p className="mb-3 text-[12.5px] text-ink-soft">{TABS.find((t) => t.key === tab)?.desc}</p>
            <div className="rounded-md border-2 border-dashed border-line-strong p-8 text-center">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-ink-soft" />
              <p className="mt-2 text-[13px]">Drop an .xlsx or .csv file here or use the button below</p>
              <input id="filein" type="file" accept=".xlsx,.csv" onChange={onPick} className="hidden" />
              <label htmlFor="filein" className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]">
                <Upload className="h-3.5 w-3.5" /> Choose file
              </label>
            </div>
          </div>
          <div>
            <button onClick={() => downloadTemplate(tab)} className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-[13px] hover:bg-paper">
              <Download className="h-3.5 w-3.5" /> Download {tab} template
            </button>
            <p className="mt-2 text-[11px] text-ink-soft">Includes column headers and one example row.</p>
          </div>
        </div>

        {validation && (
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-3 text-[12.5px]">
              <span className="inline-flex items-center gap-1 text-forest"><CheckCircle2 className="h-3.5 w-3.5" /> {validation.ok.length} valid rows</span>
              <span className="inline-flex items-center gap-1 text-garnet"><AlertCircle className="h-3.5 w-3.5" /> {validation.errors.length} errors</span>
              {validation.errors.length > 0 && (
                <button onClick={() => downloadErrorReport(validation.errors)} className="text-[11.5px] underline text-forest">Download error report</button>
              )}
            </div>
            <div className="max-h-[300px] overflow-y-auto rounded-md border border-line text-[11.5px]">
              <table className="w-full">
                <thead className="bg-paper text-[10.5px] uppercase tracking-wide text-ink-soft sticky top-0">
                  <tr><th className="py-1.5 px-2 text-left">Row</th><th className="px-2 text-left">Issues</th><th className="px-2 text-left">Data preview</th></tr>
                </thead>
                <tbody>
                  {validation.errors.slice(0, 50).map((e) => (
                    <tr key={e.row} className="border-t border-line">
                      <td className="py-1 px-2">{e.row}</td>
                      <td className="px-2 text-garnet">{e.errors.join("; ")}</td>
                      <td className="px-2 font-mono text-[10.5px]">{JSON.stringify(e.data).slice(0, 100)}</td>
                    </tr>
                  ))}
                  {validation.errors.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-forest">All rows valid — ready to import.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setParsed(null); setValidation(null); }} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Clear</button>
              <button onClick={() => doImport.mutate()} disabled={!validation.ok.length || doImport.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">
                {doImport.isPending ? "Importing…" : `Import ${validation.ok.length} rows`}
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Recent imports">
        {runsQ.data?.length ? (
          <table className="w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line"><th className="py-2 px-2 text-left">When</th><th className="px-2 text-left">Entity</th><th className="px-2 text-left">File</th><th className="px-2 text-right">OK</th><th className="px-2 text-right">Errors</th></tr>
            </thead>
            <tbody>
              {runsQ.data.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="py-1.5 px-2">{new Date(r.created_at).toLocaleString("en-KE")}</td>
                  <td className="px-2">{r.entity}</td>
                  <td className="px-2 text-ink-soft">{r.file_name ?? "—"}</td>
                  <td className="px-2 text-right text-forest">{r.ok_count}</td>
                  <td className="px-2 text-right text-garnet">{r.error_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-[12.5px] text-ink-soft">No imports yet.</p>}
      </Panel>
    </>
  );
}

// ------- validators + importers -------

async function validate(kind: EntityKind, rows: Record<string, any>[], schoolId: string) {
  const ok: any[] = [];
  const errors: { row: number; data: any; errors: string[] }[] = [];
  const req = (r: any, fields: string[]) => fields.filter((f) => !r[f] && r[f] !== 0 && r[f] !== false);

  if (kind === "students") {
    const { data: classes } = await supabase.from("classes").select("id, form, stream").eq("school_id", schoolId);
    const { data: existing } = await supabase.from("students").select("admission_no").eq("school_id", schoolId);
    const exSet = new Set((existing ?? []).map((s: any) => s.admission_no));
    rows.forEach((r, i) => {
      const errs: string[] = [];
      const missing = req(r, ["admission_no", "full_name", "form", "stream"]);
      if (missing.length) errs.push(`Missing ${missing.join(", ")}`);
      if (r.admission_no && exSet.has(String(r.admission_no))) errs.push("Admission no exists");
      const cls = (classes ?? []).find((c: any) => String(c.form) === String(r.form) && String(c.stream).toUpperCase() === String(r.stream).toUpperCase());
      if (!cls && r.form && r.stream) errs.push(`Class ${r.form}${r.stream} not found`);
      if (errs.length) errors.push({ row: i + 2, data: r, errors: errs });
      else ok.push({ ...r, _class_id: cls?.id });
    });
  } else if (kind === "staff") {
    const { data: existing } = await supabase.from("staff" as any).select("employee_no").eq("school_id", schoolId);
    const exSet = new Set((existing ?? []).map((s: any) => s.employee_no));
    rows.forEach((r, i) => {
      const errs: string[] = [];
      const missing = req(r, ["full_name", "gross_salary"]);
      if (missing.length) errs.push(`Missing ${missing.join(", ")}`);
      if (r.employee_no && exSet.has(String(r.employee_no))) errs.push("Employee no exists");
      if (r.gross_salary && isNaN(Number(r.gross_salary))) errs.push("Gross salary must be numeric");
      if (errs.length) errors.push({ row: i + 2, data: r, errors: errs }); else ok.push(r);
    });
  } else if (kind === "suppliers") {
    const { data: existing } = await supabase.from("suppliers" as any).select("supplier_no, name").eq("school_id", schoolId);
    const exSet = new Set((existing ?? []).map((s: any) => s.supplier_no));
    rows.forEach((r, i) => {
      const errs: string[] = [];
      const missing = req(r, ["name"]);
      if (missing.length) errs.push(`Missing ${missing.join(", ")}`);
      if (r.supplier_no && exSet.has(String(r.supplier_no))) errs.push("Supplier no exists");
      if (errs.length) errors.push({ row: i + 2, data: r, errors: errs }); else ok.push(r);
    });
  } else if (kind === "fee_structures") {
    const { data: classes } = await supabase.from("classes").select("id, form, stream").eq("school_id", schoolId);
    const { data: terms } = await supabase.from("terms").select("id, term, year").eq("school_id", schoolId);
    const { data: vhs } = await supabase.from("vote_heads").select("id, code").eq("school_id", schoolId);
    rows.forEach((r, i) => {
      const errs: string[] = [];
      const missing = req(r, ["form", "stream", "vote_head_code", "amount", "term", "year"]);
      if (missing.length) errs.push(`Missing ${missing.join(", ")}`);
      const cls: any = (classes ?? []).find((c: any) => String(c.form) === String(r.form) && String(c.stream).toUpperCase() === String(r.stream).toUpperCase());
      if (!cls) errs.push(`Class not found`);
      const term: any = (terms ?? []).find((t: any) => Number(t.term) === Number(r.term) && Number(t.year) === Number(r.year));
      if (!term) errs.push(`Term ${r.term}/${r.year} not found`);
      const vh: any = (vhs ?? []).find((v: any) => String(v.code).toUpperCase() === String(r.vote_head_code).toUpperCase());
      if (!vh) errs.push(`Vote head ${r.vote_head_code} not found`);
      if (errs.length || !cls || !term || !vh) errors.push({ row: i + 2, data: r, errors: errs });
      else ok.push({ ...r, _class_id: cls.id, _term_id: term.id, _vote_head_id: vh.id });
    });
  } else if (kind === "opening_balances") {
    const { data: students } = await supabase.from("students").select("id, admission_no").eq("school_id", schoolId);
    const sMap = new Map<string, string>((students ?? []).map((s: any) => [String(s.admission_no), String(s.id)]));
    rows.forEach((r, i) => {
      const errs: string[] = [];
      if (!r.admission_no) errs.push("Missing admission_no");
      if (r.admission_no && !sMap.has(String(r.admission_no))) errs.push("Student not found");
      if (isNaN(Number(r.amount))) errs.push("Amount must be numeric");
      if (errs.length) errors.push({ row: i + 2, data: r, errors: errs });
      else ok.push({ ...r, _student_id: sMap.get(String(r.admission_no)) });
    });
  }
  return { ok, errors };
}

async function runImport(kind: EntityKind, rows: any[], schoolId: string): Promise<number> {
  let count = 0;
  if (kind === "students") {
    for (const r of rows) {
      const { error } = await (supabase.from("students") as any).insert({
        school_id: schoolId, admission_no: String(r.admission_no), full_name: r.full_name,
        gender: r.gender || null, class_id: r._class_id, is_boarder: String(r.is_boarder).toLowerCase() === "true",
        guardian_name: r.guardian_name || null, guardian_phone: r.guardian_phone || null,
        guardian_relation: r.guardian_relation || null, national_id: r.national_id || null,
        joined_on: new Date().toISOString().slice(0, 10),
      });
      if (!error) count++;
    }
  } else if (kind === "staff") {
    for (const r of rows) {
      const empNo = r.employee_no || ((await supabase.rpc("next_employee_no" as any, { _school_id: schoolId })).data as unknown as string);
      const { error } = await supabase.from("staff" as any).insert({
        school_id: schoolId, employee_no: empNo, full_name: r.full_name, position: r.position || null,
        department: r.department || null, employment_date: r.employment_date || null, national_id: r.national_id || null,
        kra_pin: r.kra_pin || null, phone: r.phone || null, email: r.email || null, gross_salary: Number(r.gross_salary || 0),
        bank_name: r.bank_name || null, bank_branch: r.bank_branch || null, bank_account: r.bank_account || null,
      });
      if (!error) count++;
    }
  } else if (kind === "suppliers") {
    for (const r of rows) {
      const no = r.supplier_no || ((await supabase.rpc("next_supplier_no" as any, { _school_id: schoolId })).data as unknown as string);
      const { error } = await supabase.from("suppliers" as any).insert({
        school_id: schoolId, supplier_no: no, name: r.name, contact_person: r.contact_person || null,
        phone: r.phone || null, email: r.email || null, address: r.address || null, kra_pin: r.kra_pin || null,
        bank_name: r.bank_name || null, bank_branch: r.bank_branch || null, bank_account: r.bank_account || null,
        category: r.category || null, opening_balance: Number(r.opening_balance || 0),
      });
      if (!error) count++;
    }
  } else if (kind === "fee_structures") {
    // group rows by (class_id, term_id, is_boarder)
    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const key = `${r._class_id}|${r._term_id}|${String(r.is_boarder).toLowerCase() === "true"}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    for (const [key, items] of groups) {
      const [class_id, term_id, isBoarder] = key.split("|");
      const is_boarder = isBoarder === "true";
      const existingRes: any = await supabase.from("fee_structures").select("id").eq("school_id", schoolId).eq("term_id", term_id).eq("class_id", class_id).eq("is_boarder", is_boarder).maybeSingle();
      let fsId: string | undefined = existingRes.data?.id;
      if (!fsId) {
        const insRes: any = await (supabase.from("fee_structures") as any).insert({ school_id: schoolId, term_id, class_id, is_boarder, name: "Imported" }).select("id").single();
        if (insRes.error) continue;
        fsId = insRes.data.id;
      }
      for (const it of items) {
        await (supabase.from("fee_structure_items") as any).upsert({ fee_structure_id: fsId, vote_head_id: it._vote_head_id, amount: Number(it.amount) });
        count++;
      }
    }
  } else if (kind === "opening_balances") {
    for (const r of rows) {
      const { data: term } = await supabase.from("terms").select("id").eq("school_id", schoolId).eq("is_active", true).maybeSingle();
      if (!term) continue;
      const { data: nextNo } = await supabase.from("invoices").select("invoice_no").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1);
      const seq = nextNo?.[0]?.invoice_no?.match(/(\d+)/)?.[1];
      const newSeq = (seq ? Number(seq) + 1 : 1001).toString().padStart(5, "0");
      const { error } = await supabase.from("invoices").insert({
        school_id: schoolId, student_id: r._student_id, term_id: term.id,
        invoice_no: `INV-${newSeq}`, opening_balance: Number(r.amount), total_charges: 0,
        balance: Number(r.amount), notes: "Opening balance — imported",
      });
      if (!error) count++;
    }
  }
  return count;
}
