/**
 * Was wir anbieten – in einer Fassung, kurz genug zum Vorlesen.
 *
 * DIESE DATEI IST ZUM SELBST BEARBEITEN GEDACHT.
 *
 * Hier steht das Leistungsversprechen genau einmal. Es erscheint an drei
 * Stellen: am Ende der geführten Tour, auf der Einstiegsseite der Demo und in
 * der Verwaltersicht. Wenn es an einer Stelle geändert wird, muss es überall
 * stimmen – deshalb diese Datei.
 *
 * WARUM DAS SO WICHTIG IST
 *
 * Aus der Praxis von Produktvorführungen ist gut belegt, woran sie scheitern:
 * Der Betrachter sieht Funktionen, aber niemand sagt ihm in einem Satz, was
 * das für ihn heißt. Eine Vorführung ohne Zusammenfassung und ohne nächsten
 * Schritt endet mit "interessant" – und nichts passiert. Die Struktur unten
 * ist deshalb bewusst eine Bilanz: was geht weg, was bleibt.
 */

/** Was von Ihrem Tisch verschwindet. */
export const uebernehmen = [
  "Anrufe und Nachrichten von Mietern annehmen – rund um die Uhr",
  "Nachfragen, bis der Schaden vollständig beschrieben ist",
  "Den passenden Betrieb beauftragen",
  "Termine zwischen Betrieb und Mieter abstimmen",
  "Den Mieter auf dem Laufenden halten",
  "Alles lückenlos dokumentieren",
];

/** Was ausdrücklich bei Ihnen bleibt. */
export const bleibt = [
  "Die Entscheidung, bis wohin wir ohne Rückfrage handeln",
  "Der Blick auf alles, was abweicht – und nur darauf",
  "Der Griff ins Steuer bei jedem einzelnen Vorgang",
  "Der Nachweis gegenüber Ihren Eigentümern",
];

/**
 * Der Satz, der die ganze Sache zusammenhält. Steht in der Tour, auf der
 * Einstiegsseite und im Kopf der Verwaltersicht.
 */
export const versprechen =
  "Sie behalten den Überblick und die Kontrolle. Die Kleinarbeit haben wir.";

/**
 * Erweiterbarkeit.
 *
 * Der häufigste stille Einwand in diesem Marktsegment ist nicht "zu teuer",
 * sondern "das passt nicht zu uns" – jede Hausverwaltung arbeitet anders, und
 * wer eine fertige Software sieht, sucht zuerst nach dem, was fehlt. Deshalb
 * steht die Antwort darauf sichtbar an jeder Stelle, an der jemand zu diesem
 * Schluss kommen könnte, statt erst im Gespräch.
 */
export const erweiterbar = {
  titel: "Fehlt Ihnen etwas?",
  text:
    "Diese Demo zeigt einen Ausschnitt. Was Sie hier nicht finden, bauen wir " +
    "dazu – von der kleinen Änderung an einem Text bis zum eigenen " +
    "Arbeitsablauf oder der Anbindung an Ihre vorhandene Software.",
  beispiele: [
    "Andere Formulierungen, eigene Fristen, eigene Regeln",
    "Zusätzliche Anliegen im Mieter-Chat",
    "Eigene Auswertungen und Berichte",
    "Anbindung an Ihre Hausverwaltungssoftware",
    "Ganze Abläufe, die es hier noch nicht gibt",
  ],
  schluss:
    "Sagen Sie uns, was in Ihrem Alltag hakt. Wir schauen es uns an und sagen " +
    "Ihnen ehrlich, ob und wie schnell es geht.",
};

/**
 * Wohin sich jemand wenden soll, der überzeugt ist.
 *
 * BITTE VOR DEM ERSTEN KUNDENVERSAND ANPASSEN. Ein Vorführungslink ohne
 * nächsten Schritt ist die häufigste vergebene Gelegenheit überhaupt: Der
 * Betrachter ist überzeugt und weiß nicht, was er tun soll.
 */
export const kontakt = {
  name: "Melda",
  email: "hallo@melda.example",
  telefon: null as string | null,
  einladung: "Lassen Sie uns 20 Minuten sprechen",
};
