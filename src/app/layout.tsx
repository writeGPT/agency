import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Reporting Chatbot",
  description: "Generate company reports with AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}