import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/funds")({
  head: () => ({ meta: [{ title: "Fund accounts — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="Statutory funds"
      title="Fund accounts"
      sub="Tuition · Operations · School Fund — strictly segregated"
      phase="Phase 2 — Core money flow"
    />
  ),
});