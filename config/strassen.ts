/**
 * Echte Straßennamen je Stadt.
 *
 * Der Unterschied zwischen "eine Demo" und "meine Demo" ist erstaunlich
 * klein: Ein Hausverwalter, der in der Objektliste Straßen aus seinem
 * eigenen Viertel liest, ist sofort drin. "Musterstraße 1" erreicht das nie.
 *
 * Beim Anlegen eines Mandanten schlägt der Admin-Bereich passende Straßen
 * vor, sobald die Stadt hier hinterlegt ist. Sonst gibt es die allgemeine
 * Liste, und Sie tragen von Hand ein, was Sie kennen.
 *
 * Neue Stadt ergänzen: fünf bis acht bekannte Wohnstraßen eintragen, gern
 * gemischt aus Innenstadt und Wohnvierteln. Hausnummern kommen automatisch.
 */

export const strassenNachStadt: Record<string, string[]> = {
  Kassel: [
    "Wilhelmshöher Allee",
    "Holländische Straße",
    "Ludwig-Mond-Straße",
    "Germaniastraße",
    "Kirchweg",
    "Friedrich-Ebert-Straße",
    "Mombachstraße",
  ],
  Hannover: [
    "Podbielskistraße",
    "Lister Meile",
    "Vahrenwalder Straße",
    "Limmerstraße",
    "Sallstraße",
    "Bödekerstraße",
  ],
  Dortmund: [
    "Kaiserstraße",
    "Hohe Straße",
    "Möllerstraße",
    "Lindemannstraße",
    "Rheinische Straße",
    "Bornstraße",
  ],
  Leipzig: [
    "Karl-Liebknecht-Straße",
    "Georg-Schwarz-Straße",
    "Eisenbahnstraße",
    "Könneritzstraße",
    "Zschochersche Straße",
    "Prager Straße",
  ],
  Bremen: [
    "Schwachhauser Heerstraße",
    "Vor dem Steintor",
    "Friedrich-Ebert-Straße",
    "Osterdeich",
    "Kornstraße",
    "Hemmstraße",
  ],
  Nürnberg: [
    "Fürther Straße",
    "Äußere Bayreuther Straße",
    "Sulzbacher Straße",
    "Allersberger Straße",
    "Johannisstraße",
    "Rothenburger Straße",
  ],
  Augsburg: [
    "Hermanstraße",
    "Ulmer Straße",
    "Neuburger Straße",
    "Gögginger Straße",
    "Donauwörther Straße",
    "Bergiusstraße",
  ],
  Münster: [
    "Hammer Straße",
    "Warendorfer Straße",
    "Wolbecker Straße",
    "Grevener Straße",
    "Hüfferstraße",
    "Bohlweg",
  ],
};

/** Allgemeine Straßennamen, die es in fast jeder deutschen Stadt gibt. */
export const allgemeineStrassen = [
  "Bahnhofstraße",
  "Hauptstraße",
  "Schillerstraße",
  "Goethestraße",
  "Lindenstraße",
  "Gartenstraße",
  "Bergstraße",
  "Amselweg",
];

/**
 * Schlägt Objektnamen für eine Stadt vor: Straße plus plausible Hausnummer.
 * Deterministisch, damit derselbe Kunde immer dieselben Vorschläge bekommt.
 */
export function objektVorschlaege(stadt: string, anzahl = 4): string[] {
  const strassen = strassenNachStadt[stadt.trim()] ?? allgemeineStrassen;

  // Hausnummern aus dem Städtenamen ableiten – kein Zufall, damit der
  // Vorschlag beim erneuten Öffnen des Formulars gleich bleibt.
  const saat = [...stadt].reduce((summe, z) => summe + z.charCodeAt(0), 0);

  return strassen.slice(0, anzahl).map((strasse, index) => {
    const nummer = 3 + ((saat + index * 37) % 118);
    return `${strasse} ${nummer}`;
  });
}

/** Alle hinterlegten Städte, für die Auswahl im Admin. */
export const staedteMitStrassen = Object.keys(strassenNachStadt).sort();
