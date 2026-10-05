import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, CheckCircle2, Save, Upload, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — EduTech" }] }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

function SettingsPage() {
  const { school, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="Settings"
        sub="School profile, terms, classes, vote heads and user access — restricted to admins."
        right={isAdmin ? <Pill kind="ok">Admin</Pill> : <Pill kind="pending">Read-only</Pill>}
      />
      <Tabs defaultValue="school" className="w-full">
        <TabsList className="bg-paper border border-line">
          <TabsTrigger value="school">School profile</TabsTrigger>
          <TabsTrigger value="terms">Terms</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="votes">Vote heads</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
        </TabsList>
        <TabsContent value="school" className="mt-4"><SchoolTab schoolId={school!.id} canEdit={isAdmin} /></TabsContent>
        <TabsContent value="terms" className="mt-4"><TermsTab schoolId={school!.id} canEdit={isAdmin} /></TabsContent>
        <TabsContent value="classes" className="mt-4"><ClassesTab schoolId={school!.id} canEdit={isAdmin} /></TabsContent>
        <TabsContent value="votes" className="mt-4"><VoteHeadsTab schoolId={school!.id} canEdit={isAdmin} /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab schoolId={school!.id} canEdit={isAdmin} /></TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- School profile ---------------- */

function SchoolTab({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const schoolQ = useQuery({
    queryKey: ["school-full", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, code, county, motto, address, phone, email, logo_url, receipt_footer")
        .eq("id", schoolId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  if (schoolQ.data && !form) setForm(schoolQ.data);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("schools").update({
        name: form.name,
        code: form.code || null,
        county: form.county || null,
        motto: form.motto || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        logo_url: form.logo_url || null,
        receipt_footer: form.receipt_footer || null,
      }).eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("School profile saved");
      qc.invalidateQueries({ queryKey: ["school-full"] });
      await refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleLogoUpload = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 400 * 1024) { toast.error("Logo must be under 400 KB. Try a smaller image."); return; }
    setUploading(true);
    // Resize to max 256px and convert to PNG data URL for compact storage
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { toast.error("Could not process image"); setUploading(false); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        setForm({ ...form, logo_url: dataUrl });
        setUploading(false);
        toast.success("Logo ready — click Save changes to apply");
      };
      img.onerror = () => { toast.error("Invalid image"); setUploading(false); };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!form) return <Panel><div className="text-[12.5px] text-ink-soft">Loading…</div></Panel>;

  return (
    <>
      <Panel title="School profile">
        <div className="grid grid-cols-2 gap-4">
          <F label="School name"><input className="sf-input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} /></F>
          <F label="BOM / registration code"><input className="sf-input" value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!canEdit} /></F>
          <F label="County"><input className="sf-input" value={form.county ?? ""} onChange={(e) => setForm({ ...form, county: e.target.value })} disabled={!canEdit} /></F>
          <F label="Motto"><input className="sf-input" value={form.motto ?? ""} onChange={(e) => setForm({ ...form, motto: e.target.value })} disabled={!canEdit} /></F>
          <F label="Address"><input className="sf-input" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEdit} /></F>
          <F label="Phone"><input className="sf-input" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} /></F>
          <F label="Email"><input className="sf-input" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} /></F>
        </div>
      </Panel>

      <Panel title="Receipt branding">
        <div className="grid grid-cols-[180px_1fr] gap-6">
          <div>
            <div className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft mb-2">School logo</div>
            <div className="flex h-[140px] w-[140px] items-center justify-center rounded-md border border-dashed border-line-strong bg-paper overflow-hidden">
              {form.logo_url
                ? <img src={form.logo_url} alt="School logo" className="max-h-full max-w-full object-contain" />
                : <ImageIcon className="h-8 w-8 text-ink-soft opacity-50" />}
            </div>
            {canEdit && (
              <div className="mt-3 flex flex-col gap-1.5">
                <label className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-paper">
                  <Upload className="h-3.5 w-3.5" /> {uploading ? "Processing…" : form.logo_url ? "Replace logo" : "Upload logo"}
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }}
                  />
                </label>
                {form.logo_url && (
                  <button onClick={() => setForm({ ...form, logo_url: null })} className="text-[11.5px] text-garnet hover:underline">
                    Remove logo
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <F label="Receipt footer message">
              <textarea
                rows={3}
                className="sf-input"
                value={form.receipt_footer ?? ""}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                placeholder="e.g. Thank you for your prompt payment. For queries call the bursar's office on 0712 345 678."
              />
            </F>
            <p className="mt-2 text-[11.5px] text-ink-soft leading-snug">
              Logo, school name, address, phone, registration code, motto and this footer all appear on every PDF receipt and printed voucher.
              Use a square PNG/JPG under 400 KB for best results.
            </p>
          </div>
        </div>
      </Panel>

      {canEdit && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <button onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-1 rounded-md border border-forest bg-forest px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
            <Save className="h-3.5 w-3.5" /> Save changes
          </button>
          <SampleDataActions schoolId={form.id} />
        </div>
      )}
    </>
  );
}

function SampleDataActions({ schoolId }: { schoolId: string }) {
  const [busy, setBusy] = useState<"seed" | "clear" | null>(null);
  const clear = async () => {
    if (!confirm("Permanently delete all sample students, invoices, payments, vouchers and bursaries from this school?")) return;
    setBusy("clear");
    try {
      const { data, error } = await supabase.rpc("clear_demo_data", { _school_id: schoolId });
      if (error) throw error;
      const d = data as any;
      toast.success(`Sample data cleared — ${d?.students ?? 0} students, ${d?.invoices ?? 0} invoices, ${d?.payments ?? 0} payments removed`);
    } catch (e: any) { toast.error(e.message ?? "Failed to clear sample data"); }
    finally { setBusy(null); }
  };
  const seed = async () => {
    setBusy("seed");
    try {
      const { error } = await supabase.rpc("seed_demo_data", { _school_id: schoolId });
      if (error) throw error;
      toast.success("Sample data added");
    } catch (e: any) { toast.error(e.message ?? "Failed to seed sample data"); }
    finally { setBusy(null); }
  };
  return (
    <div className="flex items-center gap-2">
      <button onClick={seed} disabled={!!busy} className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium hover:bg-paper disabled:opacity-60">
        {busy === "seed" ? "Adding…" : "Add sample data"}
      </button>
      <button onClick={clear} disabled={!!busy} className="rounded-md border border-garnet/40 bg-surface px-3 py-1.5 text-[12px] font-medium text-garnet hover:bg-garnet/5 disabled:opacity-60">
        {busy === "clear" ? "Clearing…" : "Clear sample data"}
      </button>
    </div>
  );
}

/* ---------------- Terms ---------------- */

function TermsTab({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const termsQ = useQuery({
    queryKey: ["terms-full", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("id, year, term, start_date, end_date, is_active, is_closed")
        .eq("school_id", schoolId)
        .order("year", { ascending: false })
        .order("term", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [term, setTerm] = useState<"1" | "2" | "3">("1");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("terms").insert({
        school_id: schoolId, year: Number(year), term,
        start_date: start, end_date: end, is_active: false,
      });
      if (error) {
        if (error.code === "23505") throw new Error(`Term ${term}, ${year} already exists.`);
        throw error;
      }
    },
    onSuccess: () => { toast.success("Term added"); qc.invalidateQueries({ queryKey: ["terms-full"] }); qc.invalidateQueries({ queryKey: ["terms"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from("terms").update({ is_active: false }).eq("school_id", schoolId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("terms").update({ is_active: true, is_closed: false }).eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Active term updated"); qc.invalidateQueries({ queryKey: ["terms-full"] }); qc.invalidateQueries({ queryKey: ["terms"] }); qc.invalidateQueries({ queryKey: ["active-term"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      {canEdit && (
        <Panel title="Add term">
          <div className="grid grid-cols-5 gap-3">
            <F label="Year"><input className="sf-input" value={year} onChange={(e) => setYear(e.target.value)} /></F>
            <F label="Term">
              <select className="sf-input" value={term} onChange={(e) => setTerm(e.target.value as any)}>
                <option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option>
              </select>
            </F>
            <F label="Start date"><input type="date" className="sf-input" value={start} onChange={(e) => setStart(e.target.value)} /></F>
            <F label="End date"><input type="date" className="sf-input" value={end} onChange={(e) => setEnd(e.target.value)} /></F>
            <div className="flex items-end">
              <button onClick={() => add.mutate()} disabled={add.isPending || !start || !end} className="inline-flex h-9 items-center gap-1 rounded-md border border-forest bg-forest px-3 text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" /> Add term
              </button>
            </div>
          </div>
        </Panel>
      )}
      <Panel title="All terms">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line"><th className="py-2 px-2 text-left">Year</th><th className="px-2 text-left">Term</th><th className="px-2 text-left">Start</th><th className="px-2 text-left">End</th><th className="px-2 text-left">Status</th><th /></tr>
          </thead>
          <tbody>
            {(termsQ.data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-line">
                <td className="py-2 px-2">{t.year}</td>
                <td className="px-2">Term {t.term}</td>
                <td className="px-2">{t.start_date}</td>
                <td className="px-2">{t.end_date}</td>
                <td className="px-2">{t.is_active ? <Pill kind="ok">Active</Pill> : t.is_closed ? <Pill kind="pending">Closed</Pill> : <Pill kind="credit">Draft</Pill>}</td>
                <td className="px-2 text-right">
                  {canEdit && !t.is_active && (
                    <button onClick={() => activate.mutate(t.id)} className="inline-flex items-center gap-1 text-[11.5px] text-forest hover:underline">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Make active
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!termsQ.data?.length && <tr><td colSpan={6} className="py-6 text-center text-ink-soft">No terms yet.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

/* ---------------- Classes ---------------- */

function ClassesTab({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const classesQ = useQuery({
    queryKey: ["classes-full", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, form, stream, teacher_name")
        .eq("school_id", schoolId)
        .order("form").order("stream");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState("1");
  const [stream, setStream] = useState("A");
  const [teacher, setTeacher] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const streamClean = stream.trim().toUpperCase();
      if (!streamClean) throw new Error("Stream is required");
      const { error } = await supabase.from("classes").insert({
        school_id: schoolId, form: Number(form), stream: streamClean, teacher_name: teacher || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error(`Form ${form}${streamClean} already exists. Pick a different stream.`);
        throw error;
      }
    },
    onSuccess: () => { toast.success("Class added"); setTeacher(""); qc.invalidateQueries({ queryKey: ["classes-full"] }); qc.invalidateQueries({ queryKey: ["classes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateTeacher = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("classes").update({ teacher_name: name || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Class updated"); qc.invalidateQueries({ queryKey: ["classes-full"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Class removed"); qc.invalidateQueries({ queryKey: ["classes-full"] }); qc.invalidateQueries({ queryKey: ["classes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      {canEdit && (
        <Panel title="Add class">
          <div className="grid grid-cols-4 gap-3">
            <F label="Form">
              <select className="sf-input" value={form} onChange={(e) => setForm(e.target.value)}>
                {[1,2,3,4].map(n => <option key={n} value={n}>Form {n}</option>)}
              </select>
            </F>
            <F label="Stream"><input className="sf-input" value={stream} onChange={(e) => setStream(e.target.value.toUpperCase())} maxLength={3} /></F>
            <F label="Class teacher"><input className="sf-input" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Mr Otieno" /></F>
            <div className="flex items-end">
              <button onClick={() => add.mutate()} disabled={add.isPending} className="inline-flex h-9 items-center gap-1 rounded-md border border-forest bg-forest px-3 text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" /> Add class
              </button>
            </div>
          </div>
        </Panel>
      )}
      <Panel title="Classes">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft"><tr className="border-b border-line"><th className="py-2 px-2 text-left">Form</th><th className="px-2 text-left">Stream</th><th className="px-2 text-left">Class teacher</th><th /></tr></thead>
          <tbody>
            {(classesQ.data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-2 px-2">Form {c.form}</td>
                <td className="px-2">{c.stream}</td>
                <td className="px-2">
                  <input
                    defaultValue={c.teacher_name ?? ""}
                    disabled={!canEdit}
                    onBlur={(e) => { if (e.target.value !== (c.teacher_name ?? "")) updateTeacher.mutate({ id: c.id, name: e.target.value }); }}
                    className="sf-input max-w-[260px]"
                  />
                </td>
                <td className="px-2 text-right">
                  {canEdit && (
                    <button onClick={() => { if (confirm(`Remove Form ${c.form}${c.stream}?`)) remove.mutate(c.id); }} className="text-garnet hover:text-[#7a1d1d]" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!classesQ.data?.length && <tr><td colSpan={4} className="py-6 text-center text-ink-soft">No classes yet.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

/* ---------------- Vote heads ---------------- */

function VoteHeadsTab({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const fundsQ = useQuery({
    queryKey: ["funds", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("funds").select("id, code, name").eq("school_id", schoolId).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const vhQ = useQuery({
    queryKey: ["vote-heads-full", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vote_heads")
        .select("id, code, name, fund_id, funds(code, name)")
        .eq("school_id", schoolId)
        .order("code");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [fundId, setFundId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vote_heads").insert({
        school_id: schoolId, fund_id: fundId, code: code.toUpperCase().trim(), name: name.trim(),
      });
      if (error) {
        if (error.code === "23505") throw new Error(`Vote head code "${code.toUpperCase()}" already exists.`);
        throw error;
      }
    },
    onSuccess: () => { toast.success("Vote head added"); setCode(""); setName(""); qc.invalidateQueries({ queryKey: ["vote-heads-full"] }); qc.invalidateQueries({ queryKey: ["vote-heads"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vote_heads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["vote-heads-full"] }); qc.invalidateQueries({ queryKey: ["vote-heads"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      {canEdit && (
        <Panel title="Add vote head">
          <div className="grid grid-cols-5 gap-3">
            <F label="Fund">
              <select className="sf-input" value={fundId} onChange={(e) => setFundId(e.target.value)}>
                <option value="">Select fund…</option>
                {(fundsQ.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </F>
            <F label="Code"><input className="sf-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="OPS-WATER" /></F>
            <F label="Name" className="col-span-2"><input className="sf-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Water bills" /></F>
            <div className="flex items-end">
              <button onClick={() => add.mutate()} disabled={!fundId || !code || !name || add.isPending} className="inline-flex h-9 items-center gap-1 rounded-md border border-forest bg-forest px-3 text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>
        </Panel>
      )}
      <Panel title="Vote heads by fund">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft"><tr className="border-b border-line"><th className="py-2 px-2 text-left">Fund</th><th className="px-2 text-left">Code</th><th className="px-2 text-left">Name</th><th /></tr></thead>
          <tbody>
            {(vhQ.data ?? []).map((v) => (
              <tr key={v.id} className="border-b border-line">
                <td className="py-2 px-2">{v.funds?.name}</td>
                <td className="px-2 font-mono">{v.code}</td>
                <td className="px-2">{v.name}</td>
                <td className="px-2 text-right">
                  {canEdit && (
                    <button onClick={() => { if (confirm(`Remove ${v.code}?`)) remove.mutate(v.id); }} className="text-garnet hover:text-[#7a1d1d]"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}
            {!vhQ.data?.length && <tr><td colSpan={4} className="py-6 text-center text-ink-soft">No vote heads yet.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

/* ---------------- Users & roles ---------------- */

const ROLES = ["admin", "bursar", "principal", "board"] as const;
type Role = (typeof ROLES)[number];

function UsersTab({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const rolesQ = useQuery({
    queryKey: ["school-users", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, role, user_id, profiles(full_name, email)")
        .eq("school_id", schoolId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("bursar");

  const grant = useMutation({
    mutationFn: async () => {
      const { data: prof, error: e1 } = await supabase
        .from("profiles").select("id, email").ilike("email", email.trim()).maybeSingle();
      if (e1) throw e1;
      if (!prof) throw new Error("No user with that email has signed up yet. Ask them to create an account first.");
      const { error: e2 } = await supabase.from("user_roles").insert({
        user_id: prof.id, school_id: schoolId, role,
      });
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Role granted"); setEmail(""); qc.invalidateQueries({ queryKey: ["school-users"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role removed"); qc.invalidateQueries({ queryKey: ["school-users"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Group by user
  type Grouped = { name: string; email: string; roles: { id: string; role: Role }[] };
  const grouped = new Map<string, Grouped>();
  for (const r of rolesQ.data ?? []) {
    const g: Grouped = grouped.get(r.user_id) ?? { name: r.profiles?.full_name ?? "—", email: r.profiles?.email ?? "—", roles: [] };
    g.roles.push({ id: r.id, role: r.role as Role });
    grouped.set(r.user_id, g);
  }

  return (
    <>
      {canEdit && (
        <Panel title="Grant role">
          <p className="mb-3 text-[11.5px] text-ink-soft">The user must already have a EduTech account. Enter their sign-in email and pick a role for this school.</p>
          <div className="grid grid-cols-5 gap-3">
            <F label="Email" className="col-span-3"><input className="sf-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bursar@school.ke" /></F>
            <F label="Role">
              <select className="sf-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </F>
            <div className="flex items-end">
              <button onClick={() => grant.mutate()} disabled={!email || grant.isPending} className="inline-flex h-9 items-center gap-1 rounded-md border border-forest bg-forest px-3 text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" /> Grant
              </button>
            </div>
          </div>
        </Panel>
      )}
      <Panel title="People with access">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft"><tr className="border-b border-line"><th className="py-2 px-2 text-left">Name</th><th className="px-2 text-left">Email</th><th className="px-2 text-left">Roles</th></tr></thead>
          <tbody>
            {Array.from(grouped.entries()).map(([uid, g]) => (
              <tr key={uid} className="border-b border-line align-top">
                <td className="py-2 px-2">{g.name}</td>
                <td className="px-2">{g.email}</td>
                <td className="px-2">
                  <div className="flex flex-wrap gap-1.5">
                    {g.roles.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-paper border border-line px-2 py-[2px] text-[11px]">
                        {r.role}
                        {canEdit && (
                          <button onClick={() => revoke.mutate(r.id)} title="Revoke" className="text-ink-soft hover:text-garnet">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!grouped.size && <tr><td colSpan={3} className="py-6 text-center text-ink-soft">No users yet.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

/* ---------------- shared ---------------- */

function F({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
