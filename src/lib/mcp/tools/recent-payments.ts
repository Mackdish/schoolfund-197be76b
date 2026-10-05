import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_recent_payments",
  title: "List recent payments",
  description: "List the most recent fee payments (receipts) recorded in the school.",
  inputSchema: {
    since: z.string().optional().describe("Only payments on/after this date (YYYY-MM-DD)."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ since, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    let q = sb.from("payments")
      .select("receipt_no, paid_on, amount, method, status, payer_name, reference, students(full_name, admission_no)")
      .order("paid_on", { ascending: false }).limit(limit ?? 25);
    if (since) q = q.gte("paid_on", since);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const payments = (data ?? []).map((p) => {
      const st = p.students as { full_name: string; admission_no: string } | null;
      return {
        receipt_no: p.receipt_no, paid_on: p.paid_on, amount: Number(p.amount), method: p.method,
        status: p.status, payer_name: p.payer_name, reference: p.reference,
        student: st ? { full_name: st.full_name, admission_no: st.admission_no } : null,
      };
    });
    return { content: [{ type: "text", text: JSON.stringify(payments) }], structuredContent: { payments } };
  },
});
