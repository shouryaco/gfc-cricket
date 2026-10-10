import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"GFC Entaiterement Club Cricket",description:"Players, balanced teams, tournaments and live scoring for GFC.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
