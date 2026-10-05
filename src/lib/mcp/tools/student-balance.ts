import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_student_fee_balance",
  title: "Get student fee balance",
  description: "Show a student's invoices with charges, payments, bursaries and outstanding balance.",
  inputSchema: { admission_no: z.string().trim().min(1).describe("Student admission number.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ admission_no }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data: student, error } = await sb
      .from("students").select("id, full_name, admission_no").eq("admission_no", admission_no).maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!student) throw new ToolError(`No student with admission number ${admission_no}`);
    const { data: inv, error: e2 } = await sb
      .from("invoices")
      .select("invoice_no, issue_date, status, total_charges, total_paid, total_bursary, balance")
      .eq("student_id", student.id).order("issue_date", { ascending: false });
    if (e2) throw new ToolError(e2.message);
    const invoices = (inv ?? []).map((i) => ({
      invoice_no: i.invoice_no, issue_date: i.issue_date, status: i.status,
      total_charges: Number(i.total_charges), total_paid: Number(i.total_paid),
      total_bursary: Number(i.total_bursary), balance: Number(i.balance),
    }));
    const outstanding = invoices.reduce((s, i) => s + i.balance, 0);
    const result = { student: { full_name: student.full_name, admission_no: student.admission_no }, outstanding, invoices };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
