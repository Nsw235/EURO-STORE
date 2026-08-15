import "./globals.css";

export const metadata = {
  title: "EURO STORE",
  description: "La qualité européenne à votre portée",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0b1330",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
