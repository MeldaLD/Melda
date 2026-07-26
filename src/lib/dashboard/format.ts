/** Einheitliche deutsche Formatierung im gesamten Dashboard. */

const datumZeit = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const nurDatum = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const nurZeit = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function alsDatumZeit(iso: string | null): string {
  return iso ? datumZeit.format(new Date(iso)) : "–";
}

export function alsDatum(iso: string | null): string {
  return iso ? nurDatum.format(new Date(iso)) : "–";
}

export function alsZeit(iso: string | null): string {
  return iso ? nurZeit.format(new Date(iso)) : "–";
}

export function alsEuro(betrag: number): string {
  return euro.format(betrag);
}

export function alsZeitraum(von: string | null, bis: string | null): string {
  if (!von) return "Noch nicht terminiert";
  return bis ? `${alsZeit(von)}–${alsZeit(bis)} Uhr` : `${alsZeit(von)} Uhr`;
}
