import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VendeurShell from "@/components/VendeurShell";

export default async function VendeurLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  // Sécurité en profondeur : la RLS + le middleware bloquent déjà l'écriture
  // sur le stock, mais on referme aussi la porte côté UI.
  if (!profile || (profile.role !== "vendeur" && profile.role !== "admin")) {
    redirect("/login");
  }

  return <VendeurShell fullName={profile.full_name}>{children}</VendeurShell>;
}
