import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_students",
  title: "Search students",
  description: "Find students by name or admission number in the signed-in user's school.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Name or admission number fragment."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    const q = query.replace(/[%,()]/g, " ");
    const { data, error } = await sb
      .from("students")
      .select("id, admission_no, full_name, gender, is_boarder, guardian_name, guardian_phone")
      .or(`full_name.ilike.%${q}%,admission_no.ilike.%${q}%`)
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const students = (data ?? []).map((s) => ({
      id: s.id, admission_no: s.admission_no, full_name: s.full_name, gender: s.gender,
      is_boarder: s.is_boarder, guardian_name: s.guardian_name, guardian_phone: s.guardian_phone,
    }));
    return { content: [{ type: "text", text: JSON.stringify(students) }], structuredContent: { students } };
  },
});
