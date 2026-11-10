export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function daysAgo(value: string): string {
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const days = Math.round(diff / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

export function statusTone(status: string): "ok" | "warn" | "bad" | "muted" | "info" {
  switch (status) {
    case "published":
    case "active":
    case "signed":
    case "issued":
    case "pass":
      return "ok";
    case "in_review":
    case "submitted":
    case "partial":
    case "queued_local":
    case "draft":
      return "warn";
    case "failed":
    case "revoked":
    case "fail":
    case "retired":
      return "bad";
    case "archived":
      return "muted";
    default:
      return "info";
  }
}

const STATUS_LABELS: Record<string, string> = {
  queued_local: "Held locally",
  in_review: "In review",
  partial: "Partially signed",
  course_certificate: "Course certificate",
  track_credential: "Track credential",
  degree_conferral: "Degree conferral",
};

export function humanStatus(status: string): string {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}
