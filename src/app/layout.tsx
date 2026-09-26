import type { Metadata } from "next";
import { SubscriptionProvider } from "@/components/subscription-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Endgame | Chess",
  description: "Play chess with the computer or online. Create an account when you want to keep your progress.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><SubscriptionProvider>{children}</SubscriptionProvider></body>
    </html>
  );
}