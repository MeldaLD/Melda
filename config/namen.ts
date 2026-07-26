/**
 * Namenspools für plausible deutsche Beispieldaten.
 *
 * Der Generator zieht daraus deterministisch – gleiche Saat, gleiche Namen.
 * Bewusst gemischt: alteingesessene Namen, Zuwanderungsgeschichte, junge und
 * ältere Haushalte. Eine Mieterliste, die nur aus "Müller, Schmidt, Meier"
 * besteht, wirkt beim Vorführen sofort erfunden.
 */

export const NACHNAMEN = [
  "Brinkmann",
  "Yilmaz",
  "Kowalski",
  "Hoffmann",
  "Nowak",
  "Berger",
  "Aydin",
  "Schuster",
  "Weinert",
  "Petrova",
  "Lindner",
  "Baumgartner",
  "Özdemir",
  "Kraus",
  "Seifert",
  "Dubois",
  "Ritter",
  "Hartmann",
  "Nguyen",
  "Zimmermann",
  "Färber",
  "Grabowski",
  "Steiner",
  "Marek",
  "Wendland",
  "Ilic",
  "Rothe",
  "Kaminski",
  "Ebert",
  "Sauer",
  "Thiele",
  "Alvarez",
  "Kuhn",
  "Bergmann",
  "Novotny",
  "Reuter",
  "Haas",
  "Sowa",
  "Winkler",
  "Dietrich",
] as const;

export const VORNAMEN = [
  "Andrea",
  "Michael",
  "Sabine",
  "Thomas",
  "Petra",
  "Stefan",
  "Katrin",
  "Jürgen",
  "Nicole",
  "Frank",
  "Melanie",
  "Christian",
  "Ayse",
  "Murat",
  "Elena",
  "Piotr",
  "Hannah",
  "Lukas",
  "Ingrid",
  "Wolfgang",
  "Claudia",
  "Dirk",
  "Marta",
  "Ahmet",
  "Birgit",
  "Klaus",
  "Julia",
  "Sven",
] as const;

/** Anredeform, wie sie in einer Mieterliste steht. */
export const HAUSHALTSFORMEN = ["", "", "", "Familie "] as const;

/** Lagebezeichnungen von Wohnungen, wie sie Verwaltungen tatsächlich führen. */
export const LAGEN = [
  "EG links",
  "EG rechts",
  "1. OG links",
  "1. OG rechts",
  "1. OG Mitte",
  "2. OG links",
  "2. OG rechts",
  "2. OG Mitte",
  "3. OG links",
  "3. OG rechts",
  "DG links",
  "DG rechts",
] as const;
