import "./globals.css";
import type { Metadata } from "next";
import { DM_Sans, Lato } from "next/font/google";
import { ThemeProvider } from "@dark-factory/ui/components/theme-provider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-display",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Dark Factory",
  description: "Requirements documents in, working software out.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={`${dmSans.variable} ${lato.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <header className="flex h-16 items-center border-b border-border px-8">
            <span className="font-display font-bold">Dark Factory</span>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
