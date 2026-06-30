import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import Providers from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata = {
  title: "Agent Flow Board",
  description: "Web Kanban for GitHub",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Aplica o tema antes da primeira pintura para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t!=='light');}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
