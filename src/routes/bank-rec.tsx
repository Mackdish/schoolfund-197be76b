import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { kes } from "@/lib/money";
import { toast } from "sonner";
import { Upload, Wand2, Link2, Link2Off, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/bank-rec")({
  head: () => ({ meta: [{ title: "Bank reconciliation — EduTech" }] }),
  component: () => (
    <AppShell>
      <BankRecPage />
    </AppShell>
  ),
});

type ParsedLine = {
  txn_date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  running_balance: number | null;
};

function BankRecPage() {
  const { school, user } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();

  const [fundId, setFundId] = useState("");
  const [parsed, setParsed] = useState<ParsedLine[]>([]);
  const [fileName, setFileName] = useState("");
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [openImportId, setOpenImportId] = useState<string | null>(null);

  const fundsQ = useQuery({
    queryKey: ["funds", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funds")
        .select("id, code, name")
        .eq("school_id", schoolId)
        .order("code");
      return (data ?? []) as any[];
    },
  });

  const importsQ = useQuery({
    queryKey: ["bank-imports", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_statement_imports")
        .select("id, filename, statement_from, statement_to, line_count, fund_id, funds(name), closing_balance")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  async function handleFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    setParsed(parseStatementCsv(text));
  }

  const saveImport = useMutation({
    mutationFn: async () => {
      if (!fundId) throw new Error("Pick a fund");
      if (!parsed.length) throw new Error("Upload a CSV first");
      const dates = parsed.map((p) => p.txn_date).sort();
      const { data: imp, error } = await supabase
        .from("bank_statement_imports")
        .insert({
          school_id: schoolId,
          fund_id: fundId,
          filename: fileName,
          statement_from: dates[0],
          statement_to: dates[dates.length - 1],
          opening_balance: opening ? Number(opening) : null,
          closing_balance: closing ? Number(closing) : null,
          line_count: parsed.length,
          imported_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const rows = parsed.map((p) => ({
        import_id: imp.id,
        school_id: schoolId,
        fund_id: fundId,
        txn_date: p.txn_date,
        description: p.description,
        reference: p.reference,
        debit: p.debit,
        credit: p.credit,
        running_balance: p.running_balance,
      }));
      const { error: e2 } = await supabase.from("bank_statement_lines").insert(rows);
      if (e2) throw e2;
      const { data: matched } = await supabase.rpc("auto_match_bank_import", {
        _import_id: imp.id,
      });
      return { id: imp.id, matched: matched ?? 0 };
    },
    onSuccess: ({ id, matched }) => {
      toast.success(`Statement imported · ${matched} auto-matched`);
      setParsed([]);
      setFileName("");
      setOpening("");
      setClosing("");
      setOpenImportId(id);
      qc.invalidateQueries({ queryKey: ["bank-imports"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHead
        eyebrow="Bank vs cashbook"
        title="Bank reconciliation"
        sub="Import KCB / bank statement CSV, auto-match against the cashbook, flag exceptions and record reconciliation."
      />

      <Panel title="Import statement">
        <div className="grid grid-cols-[1fr_1fr_140px_140px_auto] gap-3 items-end">
          <L label="Fund / bank account">
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px]"
            >
              <option value="">Choose fund…</option>
              {(fundsQ.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </L>
          <L label="Statement CSV (KCB / Equity export)">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block w-full text-[12px] file:mr-2 file:rounded file:border-0 file:bg-forest file:px-2.5 file:py-1.5 file:text-white"
            />
          </L>
          <L label="Opening bal.">
            <input
              type="number"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-right font-mono text-[12.5px]"
            />
          </L>
          <L label="Closing bal.">
            <input
              type="number"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-right font-mono text-[12.5px]"
            />
          </L>
          <button
            disabled={!parsed.length || !fundId || saveImport.isPending}
            onClick={() => saveImport.mutate()}
            className="inline-flex items-center gap-1.5 rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {saveImport.isPending ? "Importing…" : "Import & auto-match"}
          </button>
        </div>

        {parsed.length > 0 && (
          <div className="mt-4 rounded-md border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[11.5px]">
              <span>
                Parsed <strong>{parsed.length}</strong> lines from{" "}
                <span className="font-mono">{fileName}</span>
              </span>
              <span className="text-ink-soft">
                Dr {kes(parsed.reduce((s, p) => s + p.debit, 0))} · Cr{" "}
                {kes(parsed.reduce((s, p) => s + p.credit, 0))}
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto px-3 py-2 text-[11.5px]">
              <table className="w-full">
                <tbody>
                  {parsed.slice(0, 50).map((p, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="py-1 pr-2">{p.txn_date}</td>
                      <td className="pr-2">{p.description}</td>
                      <td className="pr-2 font-mono text-ink-soft">
                        {p.reference}
                      </td>
                      <td className="pr-2 text-right font-mono">
                        {p.debit ? kes(p.debit) : ""}
                      </td>
                      <td className="text-right font-mono">
                        {p.credit ? kes(p.credit) : ""}
                      </td>
                    </tr>
                  ))}
                  {parsed.length > 50 && (
                    <tr>
                      <td colSpan={5} className="pt-1 text-ink-soft">
                        … +{parsed.length - 50} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-ink-soft">
          Expected columns (any order): <code>Date</code>, <code>Description / Narration</code>,{" "}
          <code>Reference</code>, <code>Debit / Withdrawal</code>, <code>Credit / Deposit</code>,
          <code> Balance</code>. Header row is auto-detected.
        </p>
      </Panel>

      <Panel title="Statement imports">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-2 px-2 text-left">File</th>
              <th className="px-2 text-left">Fund</th>
              <th className="px-2 text-left">Period</th>
              <th className="px-2 text-right">Lines</th>
              <th className="px-2 text-right font-mono">Closing</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody>
            {(importsQ.data ?? []).map((imp) => (
              <tr key={imp.id} className="border-b border-line">
                <td className="py-2 px-2 font-mono text-[11.5px]">{imp.filename}</td>
                <td className="px-2">{imp.funds?.name}</td>
                <td className="px-2 text-ink-soft">
                  {imp.statement_from} → {imp.statement_to}
                </td>
                <td className="px-2 text-right">{imp.line_count}</td>
                <td className="px-2 text-right font-mono">
                  {imp.closing_balance ? kes(Number(imp.closing_balance)) : "—"}
                </td>
                <td className="px-2 text-right">
                  <button
                    onClick={() => setOpenImportId(imp.id)}
                    className="rounded border border-line-strong px-2 py-1 text-[11.5px] hover:bg-paper"
                  >
                    Reconcile
                  </button>
                </td>
              </tr>
            ))}
            {!importsQ.data?.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-soft">
                  No statements imported yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {openImportId && (
        <ReconcileWorkbench
          importId={openImportId}
          schoolId={schoolId}
          onClose={() => setOpenImportId(null)}
        />
      )}
    </>
  );
}

function ReconcileWorkbench({
  importId,
  schoolId,
  onClose,
}: {
  importId: string;
  schoolId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selLine, setSelLine] = useState<string | null>(null);
  const [selCb, setSelCb] = useState<string | null>(null);

  const imp = useQuery({
    queryKey: ["import", importId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_statement_imports")
        .select(
          "id, filename, fund_id, statement_from, statement_to, opening_balance, closing_balance, funds(name)",
        )
        .eq("id", importId)
        .single();
      return data as any;
    },
  });

  const linesQ = useQuery({
    queryKey: ["lines", importId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_statement_lines")
        .select("id, txn_date, description, reference, debit, credit, status, matched_cashbook_id")
        .eq("import_id", importId)
        .order("txn_date")
        .order("created_at");
      return (data ?? []) as any[];
    },
  });

  const cbQ = useQuery({
    queryKey: ["cb-unmatched", schoolId, imp.data?.fund_id, imp.data?.statement_from, imp.data?.statement_to],
    enabled: !!imp.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("cashbook_entries")
        .select("id, entry_date, description, reference, receipts, payments, bank_statement_line_id")
        .eq("school_id", schoolId)
        .eq("fund_id", imp.data.fund_id)
        .gte("entry_date", imp.data.statement_from)
        .lte("entry_date", imp.data.statement_to)
        .order("entry_date");
      return (data ?? []) as any[];
    },
  });

  const autoMatch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("auto_match_bank_import", {
        _import_id: importId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n} additional matches`);
      qc.invalidateQueries({ queryKey: ["lines", importId] });
      qc.invalidateQueries({ queryKey: ["cb-unmatched"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const matchPair = useMutation({
    mutationFn: async () => {
      if (!selLine || !selCb) throw new Error("Pick a bank line and a cashbook entry");
      const ln = (linesQ.data ?? []).find((l) => l.id === selLine);
      const cb = (cbQ.data ?? []).find((c) => c.id === selCb);
      if (!ln || !cb) throw new Error("Selection missing");
      const lnAmt = Number(ln.credit) || Number(ln.debit);
      const cbAmt = Number(cb.receipts) || Number(cb.payments);
      if (Math.abs(lnAmt - cbAmt) > 0.5)
        throw new Error(`Amount mismatch: ${kes(lnAmt)} vs ${kes(cbAmt)}`);
      await supabase
        .from("cashbook_entries")
        .update({
          bank_statement_line_id: ln.id,
          reconciled: true,
          reconciled_on: ln.txn_date,
        })
        .eq("id", cb.id);
      await supabase
        .from("bank_statement_lines")
        .update({ matched_cashbook_id: cb.id, status: "matched" })
        .eq("id", ln.id);
    },
    onSuccess: () => {
      toast.success("Matched");
      setSelLine(null);
      setSelCb(null);
      qc.invalidateQueries({ queryKey: ["lines", importId] });
      qc.invalidateQueries({ queryKey: ["cb-unmatched"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unmatch = useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await supabase.rpc("unmatch_bank_line", { _line_id: lineId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lines", importId] });
      qc.invalidateQueries({ queryKey: ["cb-unmatched"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const flagged = useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await supabase
        .from("bank_statement_lines")
        .update({ status: "flagged" })
        .eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lines", importId] }),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bank_reconciliations").insert({
        school_id: schoolId,
        fund_id: imp.data.fund_id,
        statement_date: imp.data.statement_to,
        statement_balance: Number(imp.data.closing_balance ?? 0),
        cashbook_balance: cbClosing,
        notes: `Reconciled against import ${imp.data.filename}`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Reconciliation recorded"),
    onError: (e: any) => toast.error(e.message),
  });

  const lines = linesQ.data ?? [];
  const cb = cbQ.data ?? [];
  const matched = lines.filter((l) => l.status === "matched").length;
  const unmatchedLines = lines.filter((l) => l.status !== "matched");
  const unmatchedCb = cb.filter((c) => !c.bank_statement_line_id);
  const cbClosing =
    Number(imp.data?.opening_balance ?? 0) +
    cb.reduce((s, c) => s + Number(c.receipts) - Number(c.payments), 0);
  const variance = Number(imp.data?.closing_balance ?? 0) - cbClosing;

  return (
    <Panel
      title={`Reconciliation workbench · ${imp.data?.funds?.name ?? ""}`}
      right={
        <button onClick={onClose} className="text-[12px] text-ink-soft hover:text-ink">
          Close
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[12px]">
        <Stat label="Matched" value={`${matched} / ${lines.length}`} kind="ok" />
        <Stat label="Unmatched bank" value={String(unmatchedLines.length)} kind="warn" />
        <Stat label="Unmatched cashbook" value={String(unmatchedCb.length)} kind="warn" />
        <Stat label="Cashbook closing" value={kes(cbClosing)} />
        <Stat label="Statement closing" value={kes(Number(imp.data?.closing_balance ?? 0))} />
        <Stat
          label="Variance"
          value={kes(variance)}
          kind={Math.abs(variance) < 0.5 ? "ok" : "warn"}
        />
        <button
          onClick={() => autoMatch.mutate()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12px] hover:bg-paper"
        >
          <Wand2 className="h-3.5 w-3.5" /> Auto-match
        </button>
        <button
          onClick={() => matchPair.mutate()}
          disabled={!selLine || !selCb}
          className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5" /> Match selected
        </button>
        <button
          onClick={() => finalize.mutate()}
          disabled={Math.abs(variance) > 0.5 || finalize.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-forest bg-forest-light px-3 py-1.5 text-[12px] font-medium text-forest disabled:opacity-50"
        >
          Finalize reconciliation
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brass">
            Bank statement
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded border border-line">
            <table className="w-full text-[11.5px]">
              <tbody>
                {lines.map((l) => {
                  const amt = Number(l.credit) || Number(l.debit);
                  const sel = selLine === l.id;
                  return (
                    <tr
                      key={l.id}
                      onClick={() => l.status !== "matched" && setSelLine(sel ? null : l.id)}
                      className={`border-b border-line/60 ${sel ? "bg-forest-light" : l.status === "matched" ? "bg-paper/60 text-ink-soft" : "cursor-pointer hover:bg-paper"}`}
                    >
                      <td className="py-1.5 px-2 whitespace-nowrap">{l.txn_date}</td>
                      <td className="px-2">
                        <div>{l.description}</div>
                        {l.reference && (
                          <div className="font-mono text-[10.5px] text-ink-soft">
                            {l.reference}
                          </div>
                        )}
                      </td>
                      <td className="px-2 text-right font-mono">
                        {l.credit > 0 ? `+${kes(amt)}` : `−${kes(amt)}`}
                      </td>
                      <td className="px-2 text-center">
                        {l.status === "matched" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              unmatch.mutate(l.id);
                            }}
                            title="Break match"
                            className="text-ink-soft hover:text-ink"
                          >
                            <Link2Off className="h-3.5 w-3.5" />
                          </button>
                        ) : l.status === "flagged" ? (
                          <Pill kind="arrears">flag</Pill>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              flagged.mutate(l.id);
                            }}
                            title="Flag"
                            className="text-[10px] text-ink-soft hover:text-amber"
                          >
                            flag
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!lines.length && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-soft">
                      No lines
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brass">
            Cashbook (period)
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded border border-line">
            <table className="w-full text-[11.5px]">
              <tbody>
                {cb.map((c) => {
                  const amt = Number(c.receipts) || Number(c.payments);
                  const sel = selCb === c.id;
                  const isMatched = !!c.bank_statement_line_id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => !isMatched && setSelCb(sel ? null : c.id)}
                      className={`border-b border-line/60 ${sel ? "bg-forest-light" : isMatched ? "bg-paper/60 text-ink-soft" : "cursor-pointer hover:bg-paper"}`}
                    >
                      <td className="py-1.5 px-2 whitespace-nowrap">{c.entry_date}</td>
                      <td className="px-2">
                        <div>{c.description}</div>
                        {c.reference && (
                          <div className="font-mono text-[10.5px] text-ink-soft">
                            {c.reference}
                          </div>
                        )}
                      </td>
                      <td className="px-2 text-right font-mono">
                        {c.receipts > 0 ? `+${kes(amt)}` : `−${kes(amt)}`}
                      </td>
                      <td className="px-2 text-center text-[10px]">
                        {isMatched ? <Pill kind="ok">✓</Pill> : null}
                      </td>
                    </tr>
                  );
                })}
                {!cb.length && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-soft">
                      No cashbook entries in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="mt-3 inline-flex items-center gap-2 text-[11.5px] text-ink-soft">
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Tip: click one row in each column and press <strong>Match selected</strong>. Amounts must
        agree to within a shilling.
      </p>
    </Panel>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind?: "ok" | "warn";
}) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div
        className={`font-mono text-[12.5px] ${kind === "ok" ? "text-forest" : kind === "warn" ? "text-amber" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

/* CSV parser tolerant of KCB / Equity export formats. */
function parseStatementCsv(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  // Find header row by sniffing for date + debit/credit
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("date") && (lower.includes("debit") || lower.includes("withdraw") || lower.includes("credit") || lower.includes("deposit"))) {
      headerIdx = i;
      break;
    }
  }
  const headers = splitCsv(lines[headerIdx]).map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) =>
    headers.findIndex((h) => names.some((n) => h.includes(n)));

  const dateI = idx("posting date", "transaction date", "date");
  const descI = idx("narration", "description", "particulars", "details");
  const refI = idx("reference", "ref no", "ref.", "doc");
  const debI = idx("debit", "withdraw", "money out");
  const credI = idx("credit", "deposit", "money in");
  const balI = idx("balance", "running");

  const out: ParsedLine[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsv(lines[i]);
    if (!cells.length) continue;
    const date = normalizeDate(cells[dateI] ?? "");
    if (!date) continue;
    const debit = parseNum(cells[debI]);
    const credit = parseNum(cells[credI]);
    if (debit === 0 && credit === 0) continue;
    out.push({
      txn_date: date,
      description: (cells[descI] ?? "").trim(),
      reference: (cells[refI] ?? "").trim(),
      debit,
      credit,
      running_balance: balI >= 0 ? parseNum(cells[balI]) || null : null,
    });
  }
  return out;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/[, ]/g, "").replace(/\((.*)\)/, "-$1"));
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(s: string): string | null {
  s = (s || "").trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yy = m[3];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
