import "./globals.css";

export const metadata = {
  title: "Agent Flow Board",
  description: "🌸 Web Kanban for GutHub",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
