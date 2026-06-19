import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/students")({
  head: () => ({ meta: [{ title: "Students — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="Roster · 1,245 active"
      title="Student management"
      sub="Admission records, class placement and balance status"
      phase="Phase 2 — Core money flow"
    />
  ),
});