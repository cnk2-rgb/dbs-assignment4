import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grid Mood",
  description: "A live atmospheric portrait of the electrical grid."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
