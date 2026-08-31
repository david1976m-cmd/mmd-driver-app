export function formatEuro(amount?: number): string {
if (amount === undefined) return "Prijs in overleg";
return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

export function formatRideDate(value: string): string {
const date = new Date(value);
if (Number.isNaN(date.getTime())) return value;
return new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
}).format(date);
}

export function formatDurationMinutes(minutes?: number): string | undefined {
if (minutes === undefined || minutes === null || Number.isNaN(minutes)) return undefined;
if (minutes < 60) return `${minutes} min`;
const hours = Math.floor(minutes / 60);
const mins = minutes % 60;
if (mins === 0) return `${hours} u`;
return `${hours} u ${mins} min`;
}