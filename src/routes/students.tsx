import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { Plus, Search, FileText } from "lucide-react";

export const Route = createFileRoute("/students")({
  head: () => ({ meta: [{ title: "Students — SomaFin" }] }),
  component: () => (
    <AppShell>
      <StudentsPage />
    </AppShell>
  ),
});

type Student = {
  id: string;
  admission_no: string;
  full_name: string;
  gender: string | null;
  class_id: string | null;
  status: "active" | "transferred" | "graduated" | "withdrawn" | "deceased";
  is_boarder: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
};

type Klass = { id: string; form: number; stream: string };

function StudentsPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [open, setOpen] = useState<Student | "new" | null>(null);

  const classesQ = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, form, stream").eq("school_id", schoolId).order("form").order("stream");
      if (error) throw error;
      return data as Klass[];
    },
  });

  const studentsQ = useQuery({
    queryKey: ["students", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, admission_no, full_name, gender, class_id, status, is_boarder, guardian_name, guardian_phone")
        .eq("school_id", schoolId)
        .order("admission_no", { ascending: true });
      if (error) throw error;
      return data as Student[];
    },
  });

  const balancesQ = useQuery({
    queryKey: ["student-balances", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("student_id, balance")
        .eq("school_id", schoolId);
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => map.set(r.student_id, (map.get(r.student_id) ?? 0) + Number(r.balance ?? 0)));
      return map;
    },
  });

  const classMap = useMemo(() => {
    const m = new Map<string, string>();
    (classesQ.data ?? []).forEach((c) => m.set(c.id, `Form ${c.form}${c.stream}`));
    return m;
  }, [classesQ.data]);

  const filtered = useMemo(() => {
    const list = studentsQ.data ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((s) => {
      if (classFilter !== "all" && s.class_id !== classFilter) return false;
      if (!needle) return true;
      return s.full_name.toLowerCase().includes(needle) || s.admission_no.toLowerCase().includes(needle);
    });
  }, [studentsQ.data, q, classFilter]);

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student removed");
      qc.invalidateQueries({ queryKey: ["students", schoolId] });
      setOpen(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHead
        eyebrow={`Roster · ${studentsQ.data?.length ?? 0} on register`}
        title="Student management"
        sub="Admission records, class placement and outstanding balances"
        right={
          <button onClick={() => setOpen("new")} className="inline-flex items-center gap-1.5 rounded-md border border-forest bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]">
            <Plus className="h-3.5 w-3.5" /> Add student
          </button>
        }
      />

      <Panel>
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-[320px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or admission no" className="w-full rounded-md border border-line-strong bg-paper py-2 pl-9 pr-3 text-[13px] outline-none focus:border-forest" />
          </div>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
            <option value="all">All classes</option>
            {(classesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>Form {c.form}{c.stream}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2.5 px-2 text-left">Admission</th>
                <th className="px-2 text-left">Name</th>
                <th className="px-2 text-left">Class</th>
                <th className="px-2 text-left">Boarder</th>
                <th className="px-2 text-left">Guardian</th>
                <th className="px-2 text-right font-mono">Balance</th>
                <th className="px-2 text-left">Status</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const bal = balancesQ.data?.get(s.id) ?? 0;
                return (
                  <tr key={s.id} className="border-b border-line hover:bg-paper">
                    <td onClick={() => setOpen(s)} className="py-2.5 px-2 font-mono text-[12px] cursor-pointer">{s.admission_no}</td>
                    <td onClick={() => setOpen(s)} className="px-2 font-medium cursor-pointer">{s.full_name}</td>
                    <td onClick={() => setOpen(s)} className="px-2 cursor-pointer">{s.class_id ? classMap.get(s.class_id) ?? "—" : "—"}</td>
                    <td onClick={() => setOpen(s)} className="px-2 cursor-pointer">{s.is_boarder ? "Boarder" : "Day"}</td>
                    <td onClick={() => setOpen(s)} className="px-2 text-ink-soft cursor-pointer">{s.guardian_name ?? "—"}{s.guardian_phone ? ` · ${s.guardian_phone}` : ""}</td>
                    <td onClick={() => setOpen(s)} className="px-2 text-right font-mono cursor-pointer">{kes(bal)}</td>
                    <td onClick={() => setOpen(s)} className="px-2 cursor-pointer">
                      {bal > 0 ? <Pill kind="arrears">Arrears</Pill> : bal < 0 ? <Pill kind="credit">Credit</Pill> : <Pill kind="ok">Clear</Pill>}
                    </td>
                    <td className="px-2 text-right">
                      <Link to="/students/$id/statement" params={{ id: s.id }} title="Fee statement" className="inline-flex items-center text-ink-soft hover:text-forest">
                        <FileText className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={8} className="py-10 text-center text-ink-soft">No students yet. Add the first admission.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{open === "new" ? "Add student" : "Edit student"}</SheetTitle>
          </SheetHeader>
          {open && (
            <StudentForm
              schoolId={schoolId}
              classes={classesQ.data ?? []}
              initial={open === "new" ? null : open}
              onDone={() => { setOpen(null); qc.invalidateQueries({ queryKey: ["students", schoolId] }); }}
              onDelete={open !== "new" ? () => delMut.mutate(open.id) : undefined}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function StudentForm({
  schoolId, classes, initial, onDone, onDelete,
}: { schoolId: string; classes: Klass[]; initial: Student | null; onDone: () => void; onDelete?: () => void }) {
  const [form, setForm] = useState({
    admission_no: initial?.admission_no ?? "",
    full_name: initial?.full_name ?? "",
    gender: initial?.gender ?? "M",
    class_id: initial?.class_id ?? (classes[0]?.id ?? ""),
    is_boarder: initial?.is_boarder ?? false,
    status: initial?.status ?? "active",
    guardian_name: initial?.guardian_name ?? "",
    guardian_phone: initial?.guardian_phone ?? "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, school_id: schoolId, class_id: form.class_id || null };
      const res = initial
        ? await supabase.from("students").update(payload).eq("id", initial.id)
        : await supabase.from("students").insert(payload);
      if (res.error) throw res.error;
      toast.success(initial ? "Student updated" : "Student added");
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fld = "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-forest";
  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <Row>
        <L label="Admission no"><input required value={form.admission_no} onChange={(e) => setForm({ ...form, admission_no: e.target.value })} className={fld} /></L>
        <L label="Gender">
          <select value={form.gender ?? "M"} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={fld}>
            <option value="M">Male</option><option value="F">Female</option>
          </select>
        </L>
      </Row>
      <L label="Full name"><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={fld} /></L>
      <Row>
        <L label="Class">
          <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className={fld}>
            <option value="">Unassigned</option>
            {classes.map((c) => <option key={c.id} value={c.id}>Form {c.form}{c.stream}</option>)}
          </select>
        </L>
        <L label="Residence">
          <select value={form.is_boarder ? "b" : "d"} onChange={(e) => setForm({ ...form, is_boarder: e.target.value === "b" })} className={fld}>
            <option value="d">Day scholar</option><option value="b">Boarder</option>
          </select>
        </L>
      </Row>
      <L label="Status">
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className={fld}>
          <option value="active">Active</option><option value="transferred">Transferred</option>
          <option value="graduated">Graduated</option><option value="withdrawn">Withdrawn</option>
          <option value="deceased">Deceased</option>
        </select>
      </L>
      <L label="Guardian name"><input value={form.guardian_name ?? ""} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} className={fld} /></L>
      <L label="Guardian phone"><input value={form.guardian_phone ?? ""} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} className={fld} placeholder="+254..." /></L>

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-line">
        {onDelete ? (
          <button type="button" onClick={() => confirm("Remove this student permanently?") && onDelete()} className="text-[12.5px] text-garnet hover:underline">Remove</button>
        ) : <span />}
        <button disabled={busy} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Row({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-2 gap-3">{children}</div>; }
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>{children}</label>;
}
