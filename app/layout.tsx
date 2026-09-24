import type { ReactNode } from "react";
import "./globals.css";
export const metadata={title:"Sentinel AI — Market Intelligence",description:"Live market data and multi-factor trading analysis."};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>}