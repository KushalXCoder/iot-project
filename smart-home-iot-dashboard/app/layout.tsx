import type { Metadata } from "next";
// @ts-expect-error CSS side-effect imports are handled by Next.js.
import "./globals.css";
export const metadata: Metadata = { title: "Haven — Smart Home", description: "Smart home IoT monitoring dashboard" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
