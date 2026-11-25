import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusOS + Crew Sync AI",
  description:
    "College-specific event ecosystem with an AI coordination layer for clubs, venues, volunteers, and insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
