import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AI-куратор · Онлайн-школа", description: "Персональное обучение с краткосрочной и долгосрочной памятью" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
