import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/data/store";

export const metadata: Metadata = {
  title: "MyaThida — Game Shop Management",
  description: "Admin/staff console for a PS4/PS5 walk-in game shop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
