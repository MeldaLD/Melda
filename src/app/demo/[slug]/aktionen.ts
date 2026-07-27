"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ansichtKonfiguration } from "@config/ansicht";
import { cookieName } from "@/lib/demo/ansicht";

/**
 * Beispieldaten dazuladen oder wieder ausblenden.
 *
 * Die Entscheidung gehört dem Betrachter und hält für seine Sitzung. Ein
 * Cookie statt eines Datenbankfeldes, denn zwei Personen können denselben
 * Demo-Link gleichzeitig offen haben – die eine soll der anderen nicht die
 * Ansicht umstellen.
 */
export async function beispieleUmschalten(slug: string, zeigen: boolean) {
  const speicher = await cookies();
  const name = cookieName(slug);

  if (zeigen) {
    speicher.set(name, "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: ansichtKonfiguration.entscheidungGiltStunden * 60 * 60,
    });
  } else {
    speicher.delete(name);
  }

  // Die Leiste steht im Layout, die Listen darunter – beide müssen neu.
  revalidatePath(`/demo/${slug}`, "layout");
}
