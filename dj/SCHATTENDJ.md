# Der Schatten-DJ: warum er nicht gut aussieht, und was hilft

Die Bewegung stimmt. Die Gestalt nicht. Dieses Papier sagt, woran das liegt
und wie es richtig geht – recherchiert, nicht geraten.

## Was heute drin ist

Fünf einzeln gezeichnete Silhouetten – Pult, Kopf, Rumpf, Oberarm, Unterarm –
werden wie eine Gliederpuppe zusammengesetzt und über ein Skelett bewegt. Die
Bewegung ist gemessen richtig: Der Kopf nickt bei 100 wie bei 175 Schlägen je
Minute kurz nach dem Schlag, der Arm geht mit der Spannung hoch, im Breakdown
kommt der Kopfhörer ans Ohr, beim Übergang wandert die Hand mit dem echten
Reglerstand.

**Und trotzdem sieht es falsch aus.** Der Grund ist nicht die Animation,
sondern die Bauart.

## Warum eine Gliederpuppe aus Einzelteilen nicht funktioniert

Vier Fehler, die alle dieselbe Wurzel haben – die Teile sind *unabhängig
voneinander* entstanden:

1. **Zwei Schultern übereinander.** Der Rumpf bringt einen Ärmel mit, der
   Oberarm einen eigenen Deltamuskel. Beide zeichnen dieselbe Körperstelle,
   und beide liegen übereinander.
2. **Harte Nähte an den Gelenken.** Wo Oberarm und Unterarm sich treffen,
   stoßen zwei getrennte Formen aneinander. Ein Ellenbogen ist aber keine
   Naht, sondern eine Beugung derselben Haut.
3. **Nichts verformt sich.** Hebt ein Mensch den Arm, wandert die Schulter
   mit und der Umriss ändert seine Form. Eine Gliederpuppe dreht nur Klötze.
4. **Die Teile passen stilistisch nicht zusammen.** Strichstärke,
   Rundungsgrad und Proportion sind je Teil anders, weil jedes Teil eine
   eigene Zeichnung ist.

Zusammen ergibt das etwas, das *fast* wie ein Mensch aussieht und deshalb
unheimlich wirkt. Die Vorlage, die als Ziel dient, hat keinen dieser Fehler –
weil sie **eine einzige Zeichnung** ist.

## Was stattdessen richtig ist: ein Umriss, an Gelenken verformt

Die naheliegende Frage – „kann man nicht eine ganze Figur modellieren und an
den Gelenken bewegen?" – ist genau der richtige Ansatz. Er heißt in der
Spielebranche **2D-Skelettanimation mit gewichtetem Netz** (Spine, Live2D,
DragonBones) und funktioniert so: Ein Netz aus Punkten liegt über der
Zeichnung, jeder Punkt gehört anteilig zu einem oder mehreren Knochen, und
beim Bewegen der Knochen verformt sich das Netz mit
([Grundlagen](https://deepwiki.com/mrdoob/three.js/5.2-skeletal-animation-and-skinning),
[Spine](https://en.esotericsoftware.com/),
[browserbasierter Editor](https://www.keyframe.it.com/)).

**Für unseren Fall ist das deutlich einfacher als für ein Spiel**, und das ist
die eigentliche Erkenntnis der Recherche:

Ein Spiel muss eine *bemalte* Figur verformen – Textur, Falten, Schatten. Dafür
braucht es ein trianguliertes Netz mit Texturkoordinaten und einen Schattierer.
Wir haben eine **Silhouette**: eine Farbe, keine Innenzeichnung. Damit fällt
alles Aufwendige weg. Zu verformen ist nur der **Umriss**.

Also:

1. **Eine** vollständige Zeichnung wird zu einem geschlossenen Streckenzug
   verfolgt – schwarze Fläche auf weiß, Randverfolgung, dann vereinfacht auf
   ein paar hundert Punkte. Das Standardverfahren dafür ist
   [Potrace](https://potrace.sourceforge.net/potrace.pdf); für eine
   Silhouette reicht eine einfache Randverfolgung plus Douglas-Peucker, ohne
   Fremdbibliothek.
2. Ein Skelett wird daruntergelegt: Hüfte, Brust, Hals, Kopf, je Seite
   Schulter–Ellenbogen–Handgelenk. Zehn Knochen.
3. Jeder Umrisspunkt bekommt Gewichte nach seinem Abstand zu den Knochen.
   Punkte mitten am Oberarm gehören zu eins, Punkte an der Schulter anteilig
   zu zweien – dort entsteht die Beugung.
4. Je Bild: die Punkte transformieren, **einmal** füllen.

Was das löst:

- **Keine Nähte.** Es ist ein einziger geschlossener Umriss.
- **Die Schulter beugt sich**, weil die Gewichte dort mischen.
- **Ein Stil**, weil es eine Zeichnung ist.
- **„Moves einspielen"** heißt dann: Knochenwinkel als Schlüsselbilder
  hinschreiben und dazwischen überblenden. Genau das, was gemeint war.

Und es ist **billiger als heute**: rund 250 Punkttransformationen und eine
Füllung statt zehn Bildkopien. Die jetzige Fassung kostet 0,53 ms ohne
Grafikkarte; der Umriss dürfte darunter liegen.

## Was dafür gebraucht wird

**Eine** Zeichnung, und dafür gelten drei Bedingungen, die aus dem Verfahren
folgen:

- **Die Arme dürfen den Rumpf nicht berühren.** Berühren sie ihn, verschmilzt
  der Umriss und die Randverfolgung kann Arm und Rumpf nicht mehr trennen –
  dann lässt sich der Arm auch nicht mehr einzeln bewegen. Zwischen Arm und
  Körper muss überall ein sichtbarer weißer Spalt bleiben.
- **Von den Hüften aufwärts**, frontal, entspannt stehend, beide Arme leicht
  vom Körper weg und leicht angewinkelt. Aus dieser Haltung heraus lässt sich
  in jede andere drehen; aus einer verschränkten heraus nicht.
- **Reines Schwarz auf reinem Weiß**, kein Schatten, keine Innenzeichnung,
  keine Perspektive.

Das Pult bleibt, wie es ist – es bewegt sich nicht und braucht kein Skelett.

## Der Prompt dafür

> Full body silhouette of a standing DJ from the hips up, seen straight from
> the front. Wearing a plain t-shirt and large over-ear headphones. Relaxed
> neutral standing pose, both arms hanging slightly away from the body with a
> slight bend at the elbows, hands relaxed and open, clearly separated from
> the torso with visible white gaps between each arm and the body. Flat vector
> silhouette, pure solid black (#000000) on pure white (#FFFFFF), no grey, no
> gradient, no shading, no outline, no drop shadow, no floor, no background,
> no perspective, no face details. Clean smooth vector edges. Centered, whole
> figure inside the frame with margin.

Negativ: `grey, gradient, shading, outline, drop shadow, glow, background,
text, watermark, perspective, 3D, photorealistic, arms touching the body,
crossed arms, hands in pockets, cropped limbs`

**Woran die Zeichnung scheitert** – bitte vor dem Schicken prüfen:

- Berührt ein Arm den Körper? Dann unbrauchbar, egal wie gut sie sonst ist.
- Sind die Hände hinter dem Rücken oder in den Taschen? Dann fehlt das Ende
  der Kette.
- Ist ein Schlagschatten oder Boden drin? Dann verschmilzt die Figur damit.

## Bis dahin

Der Schatten-DJ ist **abgeschaltet** – Vorgabe aus, einschaltbar mit Taste D
oder dem Haken unter „Bild". Die Bewegungslogik bleibt vollständig erhalten;
sie hängt nicht an der Gestalt und wird von einem Umriss genauso getrieben wie
von fünf Einzelteilen.
