export const metadata = { title: "Mandantenverwaltung" };

/**
 * Reiner Rahmen. Der Zugangsschutz sitzt eine Ebene tiefer in
 * (geschuetzt)/layout.tsx – die Login-Seite liegt bewusst außerhalb dieser
 * Gruppe, sonst würde sie sich selbst aussperren.
 */
export default function AdminRahmen({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
