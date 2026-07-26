import type { NextConfig } from "next";

/**
 * Sicherheits-Kopfzeilen für alle Seiten.
 *
 * Eine Demo, die man Fremden schickt, sollte sich nicht in eine fremde Seite
 * einbetten lassen und keine unnötigen Daten nach außen tragen. Das kostet
 * nichts und verhindert die naheliegenden Missbrauchsfälle.
 */
const sicherheitsKopfzeilen = [
  // Nicht in fremde Seiten einbettbar – schützt vor Clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Die Demo braucht weder Kamera noch Mikrofon noch Standort.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:pfad*", headers: sicherheitsKopfzeilen },
      {
        // Demoseiten gehören nicht in Suchmaschinen. Das steht zwar auch in
        // den Metadaten, aber der Header greift zusätzlich bei Dateien.
        source: "/demo/:pfad*",
        headers: [
          ...sicherheitsKopfzeilen,
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/admin/:pfad*",
        headers: [
          ...sicherheitsKopfzeilen,
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // Der Admin-Bereich darf nirgends zwischengespeichert werden.
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },

  // Mandantenlogos kommen aus Supabase Storage.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
