"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { kleinreparaturen } from "@config/kleinreparaturen";
import { SLA_STANDARD, type MandantVorlage } from "@config/muster-mandant";
import { objektVorschlaege } from "@config/strassen";
import {
  cookieName,
  passwortStimmt,
  sitzungAnlegen,
  sitzungGueltig,
} from "@/lib/auth/admin";
import { bestandErzeugen } from "@/lib/demo/generator";
import { bestandLeeren, bestandSchreiben } from "@/lib/daten/schreiben";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { HandwerkerVorlage, MitarbeiterVorlage } from "@/lib/daten/typen";

/**
 * Server Actions des Admin-Bereichs.
 *
 * Alles hier läuft ausschließlich serverseitig mit dem Service-Role-Key.
 * Der Schutz ist der Sitzungscookie, den die Middleware für /admin prüft;
 * jede schreibende Aktion prüft ihn zusätzlich selbst, damit ein direkter
 * Aufruf ohne Umweg über eine Seite nicht durchkommt.
 */

async function sicherstellenAngemeldet() {
  const speicher = await cookies();
  if (!sitzungGueltig(speicher.get(cookieName())?.value)) {
    throw new Error("Nicht angemeldet");
  }
}

// --- Anmeldung -------------------------------------------------------------

export async function anmelden(_zustand: string | null, daten: FormData) {
  const passwort = String(daten.get("passwort") ?? "");

  // Kein Hinweis darauf, ob das Passwort fast stimmte.
  if (!passwortStimmt(passwort)) return "Passwort stimmt nicht.";

  const sitzung = sitzungAnlegen();
  const speicher = await cookies();
  speicher.set(sitzung.name, sitzung.wert, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sitzung.maxAlter,
  });

  redirect("/admin");
}

export async function abmelden() {
  const speicher = await cookies();
  speicher.delete(cookieName());
  redirect("/admin/login");
}

// --- Mandanten -------------------------------------------------------------

function zeilen(wert: FormDataEntryValue | null): string[] {
  return String(wert ?? "")
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean);
}

/**
 * Legt einen Mandanten an und erzeugt gleich die Beispieldaten.
 *
 * Das ist der Kern des Vertriebswerkzeugs: ein Formular, ein Klick, fertige
 * Demo – deutlich unter den angepeilten zehn Minuten.
 */
export async function mandantAnlegen(_zustand: string | null, daten: FormData) {
  await sicherstellenAngemeldet();

  const slug = String(daten.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const firma = String(daten.get("firma") ?? "").trim();
  const stadt = String(daten.get("stadt") ?? "").trim();

  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
    return "Die Kennung darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.";
  }
  if (!firma || !stadt) return "Firma und Stadt sind Pflichtfelder.";

  const objektNamen = zeilen(daten.get("objekte"));
  const vorlage: MandantVorlage = {
    slug,
    firma,
    stadt,
    plz: String(daten.get("plz") ?? "").trim() || "00000",
    primaerfarbe: String(daten.get("primaerfarbe") ?? "#1F4E79"),
    sekundaerfarbe: String(daten.get("sekundaerfarbe") ?? "") || null,
    ansprechpartner: String(daten.get("ansprechpartner") ?? "").trim(),
    objektNamen: objektNamen.length ? objektNamen : objektVorschlaege(stadt),
    mitarbeiter: mitarbeiterAusText(daten.get("mitarbeiter")),
    handwerker: handwerkerAusText(daten.get("handwerker")),
  };

  const db = supabaseAdmin();
  const { data: vorhanden } = await db
    .from("demo_tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (vorhanden) return `Die Kennung "${slug}" ist schon vergeben.`;

  const bestand = bestandErzeugen(vorlage);

  const { error } = await db.from("demo_tenants").insert({
    ...bestand.mandant,
    einstellungen: {
      sla_stunden: { ...SLA_STANDARD },
      kleinreparatur_grenze_euro: kleinreparaturen.grenzeEuro,
      notfall_telefon: String(daten.get("notfall_telefon") ?? "").trim() || null,
    },
    ablaufdatum: String(daten.get("ablaufdatum") ?? "") || null,
  });
  if (error) return `Anlegen fehlgeschlagen: ${error.message}`;

  try {
    await bestandSchreiben(bestand);
  } catch (fehler) {
    return fehler instanceof Error ? fehler.message : "Beispieldaten fehlgeschlagen";
  }

  revalidatePath("/admin");
  redirect(`/admin/mandanten/${slug}`);
}

/** Setzt die Beispieldaten eines Mandanten auf den Ausgangszustand zurück. */
export async function beispieldatenNeu(slug: string) {
  await sicherstellenAngemeldet();

  const db = supabaseAdmin();
  const { data: mandant } = await db
    .from("demo_tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!mandant) throw new Error("Unbekannter Mandant");

  const vorlage: MandantVorlage = {
    slug: mandant.slug,
    firma: mandant.firma,
    stadt: mandant.stadt,
    plz: "00000",
    primaerfarbe: mandant.primaerfarbe,
    sekundaerfarbe: mandant.sekundaerfarbe,
    ansprechpartner: mandant.ansprechpartner ?? "",
    objektNamen: mandant.objekt_namen ?? [],
    mitarbeiter: mandant.mitarbeiter ?? [],
    handwerker: mandant.handwerker ?? [],
  };

  await bestandLeeren(slug);
  await bestandSchreiben(bestandErzeugen(vorlage));

  revalidatePath(`/admin/mandanten/${slug}`);
  revalidatePath(`/demo/${slug}`, "layout");
}

export async function mandantLoeschen(slug: string) {
  await sicherstellenAngemeldet();
  const db = supabaseAdmin();
  // Alles Abhängige geht über ON DELETE CASCADE mit.
  await db.from("demo_tenants").delete().eq("slug", slug);
  revalidatePath("/admin");
  redirect("/admin");
}

export async function mandantUmschalten(slug: string, aktiv: boolean) {
  await sicherstellenAngemeldet();
  const db = supabaseAdmin();
  await db.from("demo_tenants").update({ ist_aktiv: aktiv }).eq("slug", slug);
  revalidatePath("/admin");
  revalidatePath(`/admin/mandanten/${slug}`);
}

/** Lädt ein Logo in den öffentlichen Bucket und verknüpft es. */
export async function logoHochladen(slug: string, daten: FormData) {
  await sicherstellenAngemeldet();

  const datei = daten.get("logo");
  if (!(datei instanceof File) || datei.size === 0) return "Keine Datei gewählt.";
  if (datei.size > 1_000_000) return "Das Logo darf höchstens 1 MB groß sein.";

  const endung = datei.name.split(".").pop()?.toLowerCase() ?? "png";
  if (!["png", "jpg", "jpeg", "svg", "webp"].includes(endung)) {
    return "Erlaubt sind PNG, JPG, SVG und WebP.";
  }

  const db = supabaseAdmin();
  // Zeitstempel im Namen, damit der Browser ein ausgetauschtes Logo auch
  // wirklich neu lädt und nicht das alte aus dem Zwischenspeicher zeigt.
  const pfad = `${slug}/logo-${Date.now()}.${endung}`;

  const { error } = await db.storage
    .from("mandanten-logos")
    .upload(pfad, datei, { contentType: datei.type, upsert: true });
  if (error) return `Hochladen fehlgeschlagen: ${error.message}`;

  const { data } = db.storage.from("mandanten-logos").getPublicUrl(pfad);
  await db.from("demo_tenants").update({ logo_url: data.publicUrl }).eq("slug", slug);

  revalidatePath(`/admin/mandanten/${slug}`);
  revalidatePath(`/demo/${slug}`, "layout");
  return null;
}

// --- Umwandlung der Formularfelder ----------------------------------------

/** Eine Zeile je Person: "Name, Rolle, Bereich" */
function mitarbeiterAusText(wert: FormDataEntryValue | null): MitarbeiterVorlage[] {
  const bereiche = ["technik", "buchhaltung", "weg", "allgemein"] as const;

  return zeilen(wert).map((zeile) => {
    const [name, rolle, bereich] = zeile.split(",").map((t) => t.trim());
    const gewaehlt = bereiche.find((b) => b === bereich?.toLowerCase()) ?? "allgemein";
    return {
      name: name || "Mitarbeiter",
      rolle: rolle || "Sachbearbeitung",
      bereich: gewaehlt,
    };
  });
}

/** Eine Zeile je Betrieb: "Firma, Gewerk" */
function handwerkerAusText(wert: FormDataEntryValue | null): HandwerkerVorlage[] {
  const gewerke = [
    "sanitaer",
    "heizung",
    "elektro",
    "schluesseldienst",
    "maler",
    "schreiner",
    "reinigung",
    "dach",
    "sonstiges",
  ] as const;

  return zeilen(wert).map((zeile) => {
    const [firma, gewerk] = zeile.split(",").map((t) => t.trim());
    const gewaehlt = gewerke.find((g) => g === gewerk?.toLowerCase()) ?? "sonstiges";
    return { firma: firma || "Partnerbetrieb", gewerk: gewaehlt };
  });
}
