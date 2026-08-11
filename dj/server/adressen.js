// Unter welcher Adresse erreichen die Gaeste den Laptop? Die Frage entscheidet
// am Abend darueber, ob die Abstimmung ueberhaupt jemand findet.

import os from 'node:os';

// Alle IPv4-Adressen, unter denen der Rechner im lokalen Netz erreichbar ist.
// Sortiert: typische WLAN-Bereiche zuerst, denn das ist fast immer die richtige.
export function lanAdressen() {
  const gefunden = [];
  for (const eintraege of Object.values(os.networkInterfaces())) {
    for (const eintrag of eintraege ?? []) {
      if (eintrag.family !== 'IPv4' || eintrag.internal) continue;
      gefunden.push(eintrag.address);
    }
  }
  return gefunden.sort((a, b) => rang(a) - rang(b));
}

function rang(adresse) {
  if (adresse.startsWith('192.168.')) return 0; // Heimrouter
  if (adresse.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(adresse)) return 2;
  if (adresse.startsWith('169.254.')) return 9; // keine Verbindung
  return 5;
}

// Direkt aufrufbar: `npm run adressen`
if (import.meta.url === `file://${process.argv[1]}`) {
  const adressen = lanAdressen();
  if (adressen.length === 0) {
    console.log('Keine LAN-Adresse gefunden. Haengt der Rechner im WLAN?');
  } else {
    console.log('Diese Adressen koennen die Gaeste erreichen:');
    for (const adresse of adressen) console.log(`  http://${adresse}:3000/p`);
  }
}
