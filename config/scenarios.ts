/**
 * Die Schadensszenarien der Demo.
 *
 * DIESE DATEI IST ZUM SELBST BEARBEITEN GEDACHT.
 * Ein neues Szenario ist ein weiterer Eintrag in der Liste unten – es ist
 * keine Programmlogik nötig. Der Chat-Ablauf ist generisch und holt sich die
 * Texte von hier; dieselben Daten speisen auch die Beispielvorgänge im
 * Dashboard.
 *
 * DEMO: Sämtliche "Erkennungen" sind hinterlegter Text. Es findet keine
 * Bildanalyse statt – das Szenario ergibt sich allein daraus, welche Kachel
 * im Foto-Dialog angetippt wurde.
 *
 * Die Bilddateien liegen unter public/demo-fotos/. Solange dort noch
 * Platzhalter liegen, funktioniert der Ablauf trotzdem vollständig.
 */

import type { Gewerk, Prioritaet } from "@/lib/daten/typen";

export type Szenario = {
  /** Kurzer, stabiler Schlüssel. Erscheint in der Datenbank am Vorgang. */
  id: string;
  /** Überschrift des Vorgangs im Dashboard. */
  titel: string;
  kategorie: string;
  gewerk: Gewerk;
  prioritaet: Prioritaet;

  /** Dateiname des Hauptfotos in public/demo-fotos/ */
  foto: string;
  /** Beschriftung der Kachel im Foto-Dialog. */
  fotoBeschriftung: string;
  /** Bildbeschreibung für Screenreader. */
  fotoAlt: string;

  /** Freitext des Mieters wird über diese Stichwörter einem Szenario zugeordnet. */
  stichwoerter: string[];

  /** Erste Reaktion der KI auf das Foto. Endet mit einer Rückfrage. */
  erkennung: string;

  /**
   * Der entscheidende Moment: Nachfrage nach einem zweiten Foto.
   * Genau hier wird die vermiedene Zweitanfahrt sichtbar.
   */
  zweitfoto: {
    frage: string;
    /** Dateinamen der Kacheln, die zur Auswahl stehen. */
    optionen: string[];
    /** Welche Kachel die Diagnose tatsächlich verfeinert. */
    korrekt: string;
  };

  /** Verfeinerte Diagnose nach dem zweiten Foto. */
  verfeinerung: string;

  /** Was der Handwerker vorher gewusst hätte – und was jetzt. */
  erkenntnis: {
    vorher: string;
    nachher: string;
  };

  /**
   * Was der Handwerkereinsatz voraussichtlich kostet.
   * Entscheidet, ob der Fall unter die Kleinreparaturklausel fällt und ob
   * dem Mieter ein Selbsthilfe-Tipp angeboten wird.
   * Siehe config/kleinreparaturen.ts
   */
  kostenschaetzungEuro: number;

  /** Zusammenfassung, die im Dashboard am Vorgang steht. */
  kiZusammenfassung: string;

  /** Vorformulierte Antwort an den Mieter – landet im Freigabe-Center. */
  mieterAntwortEntwurf: string;

  /** Nur bei Notfällen: sofortige Handlungsanweisung an den Mieter. */
  sofortmassnahme?: string;
};

export const szenarien: Szenario[] = [
  {
    id: "silikonfuge",
    titel: "Schadhafte Silikonfuge in der Dusche",
    kategorie: "Sanitär – Abdichtung",
    gewerk: "sanitaer",
    prioritaet: "routine",
    foto: "silikonfuge-nah.jpg",
    fotoBeschriftung: "Fuge in der Dusche",
    fotoAlt: "Nahaufnahme einer dunkel verfärbten Silikonfuge in einer Duschkabine",
    stichwoerter: ["fuge", "silikon", "dusche", "schimmel", "abdichtung"],
    erkennung:
      "Ich erkenne auf dem Bild eine schadhafte Silikonfuge in der Dusche mit " +
      "beginnendem Schimmelbefall. Die Fuge hat sich an mehreren Stellen von den " +
      "Fliesen gelöst. Ist das korrekt?",
    zweitfoto: {
      frage:
        "Damit der Handwerker beim ersten Termin alles dabei hat: Haben Sie noch " +
        "ein Foto aus etwas größerem Abstand? Dann sehe ich, wie lang die " +
        "betroffene Fuge insgesamt ist.",
      optionen: ["silikonfuge-weit.jpg", "bad-uebersicht.jpg", "wand-detail.jpg"],
      korrekt: "silikonfuge-weit.jpg",
    },
    verfeinerung:
      "Danke, das hilft. Auf dem zweiten Bild sehe ich, dass die Fuge über die " +
      "gesamte Länge der Duschwanne betroffen ist, etwa 1,80 Meter, und dass auch " +
      "die senkrechte Eckfuge Schaden genommen hat. Der Betrieb bringt damit " +
      "gleich genug Material und das passende Werkzeug mit.",
    erkenntnis: {
      vorher: "Silikonfuge ausbessern, Materialbedarf unbekannt",
      nachher: "1,80 m Wannenfuge und Eckfuge erneuern, Schimmelentferner mitbringen",
    },
    kostenschaetzungEuro: 180,
    kiZusammenfassung:
      "Silikonfuge an Duschwanne über volle Länge (ca. 1,80 m) schadhaft, " +
      "zusätzlich senkrechte Eckfuge. Beginnender Schimmelbefall, keine " +
      "Feuchtigkeit in angrenzenden Bauteilen erkennbar. Materialbedarf steht fest.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre Meldung. Wir haben die schadhafte " +
      "Silikonfuge an unseren Sanitärbetrieb weitergeleitet. Der Betrieb meldet " +
      "sich in den nächsten zwei Werktagen bei Ihnen zur Terminabstimmung.\n\n" +
      "Mit freundlichen Grüßen",
  },

  {
    id: "wasserhahn-tropft",
    titel: "Tropfender Wasserhahn in der Küche",
    kategorie: "Sanitär – Armatur",
    gewerk: "sanitaer",
    prioritaet: "routine",
    foto: "wasserhahn-nah.jpg",
    fotoBeschriftung: "Wasserhahn Küche",
    fotoAlt: "Küchenarmatur, an deren Auslauf ein Wassertropfen hängt",
    stichwoerter: ["wasserhahn", "tropft", "armatur", "küche", "hahn"],
    erkennung:
      "Ich sehe eine tropfende Küchenarmatur. Das Wasser tritt am Auslauf aus, " +
      "nicht am Anschluss darunter. Das deutet auf eine verschlissene Kartusche " +
      "hin. Trifft das zu?",
    zweitfoto: {
      frage:
        "Eine Frage noch, damit der Handwerker das passende Ersatzteil dabei hat: " +
        "Können Sie mir den Bereich unter der Spüle zeigen? Dort sind die " +
        "Absperrventile und meist auch die Typenbezeichnung zu sehen.",
      optionen: [
        "spuele-unterschrank.jpg",
        "wasserhahn-weit.jpg",
        "kueche-uebersicht.jpg",
      ],
      korrekt: "spuele-unterschrank.jpg",
    },
    verfeinerung:
      "Sehr gut. Ich erkenne eine Einhebelmischer-Armatur mit 35-mm-Kartusche und " +
      "funktionsfähige Eckventile unter der Spüle. Der Betrieb kann die Kartusche " +
      "direkt mitbringen und braucht das Wasser nicht im ganzen Haus abzustellen.",
    erkenntnis: {
      vorher: "Armatur tropft, Ursache und Ersatzteil offen",
      nachher: "35-mm-Kartusche Einhebelmischer, Eckventile vorhanden – Teil kommt mit",
    },
    kostenschaetzungEuro: 95,
    kiZusammenfassung:
      "Einhebelmischer in der Küche tropft am Auslauf, verschlissene Kartusche " +
      "(35 mm). Eckventile unter der Spüle vorhanden und gängig. Reparatur in " +
      "einem Termin ohne Absperrung des Hausanschlusses möglich.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre Meldung. Der tropfende Wasserhahn ist " +
      "an unseren Sanitärbetrieb weitergeleitet. Das Ersatzteil ist bereits " +
      "bekannt, der Betrieb bringt es zum Termin mit.\n\nMit freundlichen Grüßen",
  },

  {
    id: "heizung-kalt",
    titel: "Heizkörper wird nicht warm",
    kategorie: "Heizung – Wärmeverteilung",
    gewerk: "heizung",
    prioritaet: "dringend",
    foto: "heizkoerper-nah.jpg",
    fotoBeschriftung: "Heizkörper Wohnzimmer",
    fotoAlt: "Heizkörper mit Thermostatventil in einem Wohnraum",
    stichwoerter: ["heizung", "heizkörper", "kalt", "warm", "thermostat", "frieren"],
    erkennung:
      "Ich sehe einen Heizkörper mit Thermostatventil. Sie schreiben, er wird " +
      "nicht warm. Bevor ich einen Handwerker beauftrage: Bleibt der Heizkörper " +
      "komplett kalt, oder wird er unten warm und oben kalt?",
    zweitfoto: {
      frage:
        "Können Sie mir noch das Thermostatventil aus der Nähe zeigen? Auf der " +
        "Kappe steht der Hersteller – daran erkenne ich, welcher Ventileinsatz " +
        "passt, falls er getauscht werden muss.",
      optionen: [
        "thermostat-nah.jpg",
        "heizkoerper-weit.jpg",
        "wohnzimmer-uebersicht.jpg",
      ],
      korrekt: "thermostat-nah.jpg",
    },
    verfeinerung:
      "Danke. Es handelt sich um ein Standardventil mit M30x1,5-Anschluss. In " +
      "Verbindung mit Ihrer Beschreibung – unten warm, oben kalt – ist Luft im " +
      "Heizkörper die wahrscheinlichste Ursache. Der Betrieb bringt " +
      "Entlüftungsschlüssel und einen passenden Ventileinsatz gleich mit, falls " +
      "das Entlüften nicht reicht.",
    erkenntnis: {
      vorher: "Heizkörper kalt, Ursache offen – Monteur kommt ohne Ersatzteil",
      nachher: "Luft im Heizkörper, Ventil M30x1,5 – Entlüftung und Ersatzventil dabei",
    },
    kostenschaetzungEuro: 90,
    kiZusammenfassung:
      "Heizkörper im Wohnzimmer unten warm, oben kalt – Hinweis auf Luft im " +
      "System. Thermostatventil M30x1,5. Prüfen, ob weitere Einheiten im Strang " +
      "betroffen sind; ggf. Anlagendruck kontrollieren.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre Meldung. Wir haben unseren " +
      "Heizungsbetrieb beauftragt, er meldet sich kurzfristig zur " +
      "Terminabstimmung. Sollte die Wohnung bis dahin nicht ausreichend warm " +
      "werden, melden Sie sich bitte umgehend.\n\nMit freundlichen Grüßen",
  },

  {
    id: "wasserfleck-decke",
    titel: "Wasserfleck an der Zimmerdecke",
    kategorie: "Sanitär – Wasserschaden",
    gewerk: "sanitaer",
    prioritaet: "notfall",
    foto: "wasserfleck-decke.jpg",
    fotoBeschriftung: "Fleck an der Decke",
    fotoAlt: "Bräunlicher, feuchter Fleck an einer weißen Zimmerdecke",
    stichwoerter: [
      "wasser",
      "decke",
      "fleck",
      "tropft",
      "nass",
      "durchnässt",
      "wasserschaden",
    ],
    erkennung:
      "Das sieht nach einem aktiven Wasserschaden aus: ein feuchter, " +
      "durchgedrückter Fleck an der Decke mit deutlicher Randbildung. Das ist " +
      "kein alter Schaden. Ich stufe das als Notfall ein und leite es sofort " +
      "weiter.",
    sofortmassnahme:
      "Bitte tun Sie jetzt sofort zwei Dinge: Stellen Sie einen Eimer unter die " +
      "Stelle und schalten Sie in dem Raum die Sicherung für Licht und Steckdosen " +
      "aus. Betreten Sie den Bereich nicht, falls sich die Decke sichtbar " +
      "durchbiegt.",
    zweitfoto: {
      frage:
        "Ein Foto hilft mir noch sehr: Können Sie den Fleck aus etwas größerem " +
        "Abstand aufnehmen? Ich möchte sehen, wie weit er sich ausgebreitet hat " +
        "und wo im Raum er sitzt.",
      optionen: ["wasserfleck-weit.jpg", "decke-uebersicht.jpg", "wand-detail.jpg"],
      korrekt: "wasserfleck-weit.jpg",
    },
    verfeinerung:
      "Der Fleck sitzt direkt unterhalb des Badezimmers der darüberliegenden " +
      "Wohnung und misst etwa 60 mal 40 Zentimeter. Damit ist die Ursache sehr " +
      "wahrscheinlich eine undichte Leitung oder Abdichtung in der Wohnung " +
      "darüber. Der Notdienst weiß dadurch, dass er Zugang zu beiden Wohnungen " +
      "braucht – das erspart eine zweite Anfahrt.",
    erkenntnis: {
      vorher: "Wasserschaden gemeldet, Ursache und Zugangsbedarf unklar",
      nachher: "Ursache in der Wohnung darüber – Notdienst organisiert beide Zugänge",
    },
    kostenschaetzungEuro: 850,
    kiZusammenfassung:
      "Aktiver Wasseraustritt an der Decke, ca. 60 × 40 cm, unterhalb des Bades " +
      "der darüberliegenden Einheit. Notdienst alarmiert, Strom im Raum " +
      "abgeschaltet. Zugang zur Wohnung darüber erforderlich. " +
      "Versicherungsmeldung vorbereiten.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre schnelle Meldung. Wir haben den " +
      "Notdienst beauftragt, er ist unterwegs zu Ihnen. Bitte lassen Sie den " +
      "Strom in dem betroffenen Raum bis dahin ausgeschaltet.\n\nWir melden uns " +
      "im Anschluss wegen der Schadensregulierung bei Ihnen.\n\n" +
      "Mit freundlichen Grüßen",
  },

  {
    id: "schimmel-wand",
    titel: "Schimmel an der Außenwand im Schlafzimmer",
    kategorie: "Bauschaden – Feuchtigkeit",
    gewerk: "maler",
    prioritaet: "dringend",
    foto: "schimmel-ecke.jpg",
    fotoBeschriftung: "Dunkle Stelle an der Wand",
    fotoAlt: "Dunkler Schimmelbefall in einer Zimmerecke oberhalb der Fußleiste",
    stichwoerter: ["schimmel", "wand", "stockflecken", "feucht", "schwarz", "ecke"],
    erkennung:
      "Ich erkenne Schimmelbefall in einer Raumecke, ausgehend vom Übergang " +
      "zwischen Wand und Fußleiste. Die Fläche ist etwa handtellergroß. Befindet " +
      "sich diese Ecke an einer Außenwand?",
    zweitfoto: {
      frage:
        "Damit wir die Ursache und nicht nur das Symptom angehen: Können Sie mir " +
        "die Ecke aus größerem Abstand zeigen, möglichst mit dem Fenster im Bild? " +
        "Daran sehe ich, ob es sich um eine Wärmebrücke oder um einen " +
        "Lüftungsfehler handelt.",
      optionen: ["schimmel-weit.jpg", "fenster-detail.jpg", "wand-detail.jpg"],
      korrekt: "schimmel-weit.jpg",
    },
    verfeinerung:
      "Auf dem zweiten Bild sehe ich, dass die Ecke an eine Außenwand grenzt und " +
      "sich neben dem Fenster befindet. Das spricht für eine Wärmebrücke am " +
      "Fensteranschluss. Der Betrieb bringt ein Feuchtemessgerät mit und kann die " +
      "Ursache beim ersten Termin feststellen, statt nur zu überstreichen.",
    erkenntnis: {
      vorher:
        "Schimmel entfernen und überstreichen – Ursache bleibt, Befall kommt wieder",
      nachher:
        "Verdacht Wärmebrücke am Fensteranschluss – Feuchtemessung beim ersten Termin",
    },
    kostenschaetzungEuro: 450,
    kiZusammenfassung:
      "Schimmelbefall ca. 25 × 25 cm in Außenwandecke neben Fenster, " +
      "Verdacht auf Wärmebrücke am Fensteranschluss. Feuchtemessung veranlasst. " +
      "Mieterhinweis zum Lüftungsverhalten wurde noch nicht erteilt.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre Meldung. Wir nehmen Schimmelbefall " +
      "ernst und lassen zunächst die Ursache feststellen, bevor die Fläche " +
      "saniert wird. Unser Malerbetrieb meldet sich zur Terminabstimmung.\n\n" +
      "Mit freundlichen Grüßen",
  },

  {
    id: "treppenhauslicht",
    titel: "Treppenhausbeleuchtung im 2. OG defekt",
    kategorie: "Elektro – Beleuchtung",
    gewerk: "elektro",
    prioritaet: "routine",
    foto: "treppenhaus-dunkel.jpg",
    fotoBeschriftung: "Dunkles Treppenhaus",
    fotoAlt: "Treppenhausabsatz mit erloschener Deckenleuchte",
    stichwoerter: ["licht", "treppenhaus", "beleuchtung", "lampe", "dunkel", "birne"],
    erkennung:
      "Ich sehe einen unbeleuchteten Treppenabsatz mit einer Deckenleuchte, die " +
      "nicht brennt. Betrifft es nur diese eine Leuchte oder das ganze " +
      "Treppenhaus?",
    zweitfoto: {
      frage:
        "Können Sie mir die Leuchte selbst noch aus der Nähe zeigen? An der " +
        "Bauform erkenne ich, ob ein Leuchtmittel getauscht werden muss oder ob " +
        "es eine fest verbaute LED-Einheit ist.",
      optionen: ["leuchte-nah.jpg", "treppenhaus-weit.jpg", "schalter-detail.jpg"],
      korrekt: "leuchte-nah.jpg",
    },
    verfeinerung:
      "Es handelt sich um eine LED-Deckenleuchte mit fest verbautem Leuchtmittel, " +
      "das heißt die komplette Leuchte muss getauscht werden. Der Elektriker " +
      "bringt eine baugleiche Leuchte mit, statt erst zu schauen und dann noch " +
      "einmal zu kommen.",
    erkenntnis: {
      vorher: "Leuchtmittel tauschen – vor Ort stellt sich heraus: geht nicht",
      nachher: "Fest verbaute LED-Leuchte, Ersatzleuchte kommt direkt mit",
    },
    kostenschaetzungEuro: 140,
    kiZusammenfassung:
      "LED-Deckenleuchte auf dem Treppenabsatz 2. OG ohne Funktion, " +
      "Leuchtmittel fest verbaut, kompletter Leuchtentausch erforderlich. " +
      "Übrige Beleuchtung im Treppenhaus funktioniert.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für den Hinweis auf die defekte Beleuchtung im " +
      "Treppenhaus. Wir haben unseren Elektrobetrieb beauftragt, die Leuchte wird " +
      "in den nächsten Tagen getauscht.\n\nMit freundlichen Grüßen",
  },

  {
    id: "abfluss-verstopft",
    titel: "Abfluss im Bad läuft nicht ab",
    kategorie: "Sanitär – Entwässerung",
    gewerk: "sanitaer",
    prioritaet: "dringend",
    foto: "abfluss-verstopft.jpg",
    fotoBeschriftung: "Stehendes Wasser im Waschbecken",
    fotoAlt: "Waschbecken, in dem das Wasser nicht abläuft",
    stichwoerter: [
      "abfluss",
      "verstopft",
      "läuft nicht ab",
      "waschbecken",
      "wasser steht",
    ],
    erkennung:
      "Im Waschbecken steht das Wasser, es läuft nicht oder nur sehr langsam ab. " +
      "Betrifft das nur das Waschbecken, oder auch Dusche und Toilette?",
    zweitfoto: {
      frage:
        "Zeigen Sie mir bitte noch den Siphon unter dem Waschbecken. Daran " +
        "erkenne ich, ob der Betrieb mit einer Handreinigung auskommt oder eine " +
        "Rohrreinigungsspirale braucht.",
      optionen: ["siphon-nah.jpg", "bad-uebersicht.jpg", "dusche-detail.jpg"],
      korrekt: "siphon-nah.jpg",
    },
    verfeinerung:
      "Der Siphon ist ein Standard-Flaschengeruchverschluss aus Kunststoff und " +
      "gut zugänglich. Da nur das Waschbecken betroffen ist, liegt die Verstopfung " +
      "sehr wahrscheinlich im Siphon selbst. Der Betrieb weiß, dass er ohne " +
      "größeres Gerät auskommt.",
    erkenntnis: {
      vorher:
        "Verstopfung gemeldet – Rohrreinigungsfahrzeug wird vorsorglich geschickt",
      nachher: "Einzelverstopfung im Siphon, gut zugänglich – Standardeinsatz genügt",
    },
    kostenschaetzungEuro: 85,
    kiZusammenfassung:
      "Waschbecken im Bad läuft nicht ab, Dusche und WC unauffällig. " +
      "Kunststoff-Flaschensiphon, frei zugänglich. Einzelverstopfung " +
      "wahrscheinlich, kein Strangproblem.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre Meldung. Unser Sanitärbetrieb kümmert " +
      "sich um den verstopften Abfluss und meldet sich zeitnah bei Ihnen zur " +
      "Terminabstimmung.\n\nMit freundlichen Grüßen",
  },

  {
    id: "fensterschloss",
    titel: "Fenstergriff im Kinderzimmer defekt",
    kategorie: "Fenster – Beschlag",
    gewerk: "schreiner",
    prioritaet: "routine",
    foto: "fenstergriff-nah.jpg",
    fotoBeschriftung: "Fenstergriff",
    fotoAlt: "Fenstergriff, der lose in der Halterung sitzt",
    stichwoerter: [
      "fenster",
      "griff",
      "schloss",
      "geht nicht zu",
      "beschlag",
      "klemmt",
    ],
    erkennung:
      "Ich sehe einen Fenstergriff, der nicht mehr fest in der Halterung sitzt. " +
      "Lässt sich das Fenster damit noch schließen und verriegeln?",
    zweitfoto: {
      frage:
        "Können Sie mir das Fenster im Ganzen zeigen? Ich möchte sehen, ob es " +
        "sich um ein Dreh-Kipp-Fenster handelt und wie der Rahmen aussieht – " +
        "danach richtet sich der passende Ersatzbeschlag.",
      optionen: ["fenster-gesamt.jpg", "fenster-detail.jpg", "kinderzimmer.jpg"],
      korrekt: "fenster-gesamt.jpg",
    },
    verfeinerung:
      "Es ist ein Dreh-Kipp-Kunststofffenster mit üblichem Standardbeschlag und " +
      "einer Griffplatte mit 43 Millimeter Lochabstand. Der Betrieb kann den " +
      "passenden Griff direkt mitbringen.",
    erkenntnis: {
      vorher: "Griff defekt – Monteur misst aus, bestellt, kommt erneut",
      nachher: "Dreh-Kipp-Beschlag, 43 mm Lochabstand – Ersatzgriff kommt mit",
    },
    kostenschaetzungEuro: 75,
    kiZusammenfassung:
      "Fenstergriff im Kinderzimmer lose, Fenster schließt noch. " +
      "Dreh-Kipp-Kunststofffenster, Griffplatte 43 mm Lochabstand. " +
      "Kein Sicherheitsrisiko, planbarer Termin.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre Meldung. Der defekte Fenstergriff wird " +
      "getauscht, unser Betrieb meldet sich zur Terminabstimmung. Bitte nutzen " +
      "Sie das Fenster bis dahin vorsichtig.\n\nMit freundlichen Grüßen",
  },

  {
    id: "klingelanlage",
    titel: "Gegensprechanlage ohne Funktion",
    kategorie: "Elektro – Kommunikation",
    gewerk: "elektro",
    prioritaet: "routine",
    foto: "klingel-nah.jpg",
    fotoBeschriftung: "Klingelanlage",
    fotoAlt: "Innensprechstelle einer Gegensprechanlage an einer Wohnungswand",
    stichwoerter: [
      "klingel",
      "gegensprechanlage",
      "türöffner",
      "sprechanlage",
      "summer",
    ],
    erkennung:
      "Ich sehe die Innensprechstelle Ihrer Gegensprechanlage. Funktioniert gar " +
      "nichts mehr, oder klingelt es zwar, aber der Türöffner reagiert nicht?",
    zweitfoto: {
      frage:
        "Zeigen Sie mir bitte noch das Klingeltableau unten am Hauseingang. " +
        "Daran erkenne ich Hersteller und Baujahr der Anlage – bei älteren " +
        "Anlagen sind Ersatzteile nicht immer vorrätig.",
      optionen: ["klingeltableau.jpg", "hauseingang.jpg", "flur-detail.jpg"],
      korrekt: "klingeltableau.jpg",
    },
    verfeinerung:
      "Es handelt sich um eine Zweidraht-Anlage üblicher Bauart, etwa 15 Jahre " +
      "alt. Ersatzteile sind verfügbar. Da nur Ihre Sprechstelle betroffen ist " +
      "und die anderen Parteien funktionieren, liegt der Fehler in Ihrer Einheit " +
      "und nicht in der Zentrale – der Elektriker braucht keinen Zugang zum " +
      "Technikraum.",
    erkenntnis: {
      vorher: "Anlage defekt – Elektriker prüft erst, Zugang zum Technikraum ungeklärt",
      nachher:
        "Zweidraht-Anlage, Fehler in der Einheit – ein Termin, kein Zusatzzugang",
    },
    kostenschaetzungEuro: 190,
    kiZusammenfassung:
      "Innensprechstelle ohne Funktion, übrige Parteien nicht betroffen. " +
      "Zweidraht-Anlage, ca. 15 Jahre alt, Ersatzteile verfügbar. " +
      "Fehler in der Wohnungseinheit, Zentrale unauffällig.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihre Meldung. Unser Elektrobetrieb kümmert " +
      "sich um die Gegensprechanlage und meldet sich zur Terminabstimmung.\n\n" +
      "Mit freundlichen Grüßen",
  },

  {
    id: "muellraum",
    titel: "Müllraum überfüllt",
    kategorie: "Objektbetreuung – Reinigung",
    gewerk: "reinigung",
    prioritaet: "routine",
    foto: "muellraum-voll.jpg",
    fotoBeschriftung: "Müllraum",
    fotoAlt: "Müllraum mit überfüllten Tonnen und daneben abgestellten Säcken",
    stichwoerter: ["müll", "mülltonne", "müllraum", "abfall", "voll", "stinkt"],
    erkennung:
      "Ich sehe überfüllte Behälter im Müllraum, daneben abgestellte Säcke. " +
      "Handelt es sich um Restmüll oder um Sperrmüll, der dort abgestellt wurde?",
    zweitfoto: {
      frage:
        "Können Sie den Raum einmal im Ganzen fotografieren? Ich möchte sehen, " +
        "wie viele Behälter betroffen sind – danach richtet sich, ob eine " +
        "Sonderleerung nötig ist oder der reguläre Turnus erhöht werden muss.",
      optionen: ["muellraum-weit.jpg", "hof-uebersicht.jpg", "container-detail.jpg"],
      korrekt: "muellraum-weit.jpg",
    },
    verfeinerung:
      "Auf dem Übersichtsbild zähle ich vier Restmülltonnen, alle voll, sowie " +
      "etwa sechs zusätzliche Säcke. Das ist mehr als eine einmalige Spitze. Ich " +
      "schlage der Verwaltung neben der Sonderleerung eine Prüfung des " +
      "Abfuhrturnus vor.",
    erkenntnis: {
      vorher: "Sonderleerung beauftragen – Problem wiederholt sich in zwei Wochen",
      nachher:
        "Vier Tonnen dauerhaft überlastet – Turnuserhöhung wird gleich mitgeprüft",
    },
    kostenschaetzungEuro: 60,
    kiZusammenfassung:
      "Müllraum überfüllt: vier Restmülltonnen voll, zusätzlich ca. sechs Säcke " +
      "daneben. Kein Sperrmüll. Wiederkehrendes Problem, Prüfung des " +
      "Abfuhrturnus empfohlen.",
    mieterAntwortEntwurf:
      "Guten Tag,\n\nvielen Dank für Ihren Hinweis. Wir haben eine Sonderleerung " +
      "veranlasst und prüfen zugleich, ob der Abfuhrturnus für das Objekt erhöht " +
      "werden muss.\n\nMit freundlichen Grüßen",
  },
];

/** Schneller Zugriff über die Szenario-ID. */
export const szenarioNach = new Map(szenarien.map((s) => [s.id, s]));

/** Ordnet freien Mieter-Text einem Szenario zu. Reine Stichwortsuche. */
export function szenarioAusText(text: string): Szenario | undefined {
  const klein = text.toLowerCase();
  let bestes: { szenario: Szenario; treffer: number } | undefined;

  for (const szenario of szenarien) {
    const treffer = szenario.stichwoerter.filter((w) => klein.includes(w)).length;
    if (treffer > 0 && (!bestes || treffer > bestes.treffer)) {
      bestes = { szenario, treffer };
    }
  }
  return bestes?.szenario;
}
