export function kes(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return "KSh " + v.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function kesNum(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
