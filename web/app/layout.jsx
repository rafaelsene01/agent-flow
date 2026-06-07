import "./globals.css";

export const metadata = {
  title: "Hana Board",
  description: "🌸 Web Kanban for Linear",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
