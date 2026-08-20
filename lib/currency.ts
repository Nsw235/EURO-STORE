// Taux fixe FCFA (zone CEMAC/UEMOA, parité fixe avec l'euro).
// 1 € = 655.957 FCFA — parité officielle, pas un taux de marché flottant.
export const EUR_TO_FCFA = 655.957;

export function eurToFcfa(amountEur: number): number {
  return Math.round(amountEur * EUR_TO_FCFA);
}

// "419 812" — espace insécable comme séparateur de milliers (convention FCFA)
export function formatFcfa(amountEur: number): string {
  const fcfa = eurToFcfa(amountEur);
  return fcfa.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ");
}

export function formatEur(amountEur: number): string {
  return amountEur.toFixed(2).replace(".", ",");
}

// Paire prête à l'affichage : montant principal FCFA + équivalent EUR
export function formatDual(amountEur: number): { fcfa: string; eur: string } {
  return { fcfa: formatFcfa(amountEur), eur: formatEur(amountEur) };
}
