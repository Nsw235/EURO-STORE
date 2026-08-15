"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Identifiants incorrects.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    router.push(profile?.role === "admin" ? "/admin" : "/vendeur/caisse");
    router.refresh();
  }

  return (
    <main className="login-screen">
      <form onSubmit={handleLogin} className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full.png" alt="EURO STORE — Smartphone & accessoires" className="login-logo" />
        <p className="login-sub">La qualité européenne à votre portée</p>

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vendeur@eurostore.fr"
          required
        />

        <label>Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="login-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
