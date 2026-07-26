import type { MetadataRoute } from "next";

/**
 * Nichts davon gehört in eine Suchmaschine.
 *
 * Eine Demo, die unter dem Namen eines Interessenten läuft, darf nicht
 * auffindbar sein – weder für dessen Wettbewerber noch für ihn selbst über
 * eine Google-Suche. Der Admin-Bereich ohnehin nicht.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
