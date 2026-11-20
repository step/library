import type { Metadata } from "next";
import "./globals.css";
import AppShell from '../../components/AppShell';
import { getSession } from './lib/session';
import Login from '../../components/Login';
import SessionProviderWrapper from "./SessionProviderWrapper";
import { lexend } from './lib/fonts';


export const metadata: Metadata = {
  title: "Library",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#fff",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  return (
    <html lang="en">
      <body className={`${lexend.className} ${lexend.variable}`}>
        {
          !session ? <Login /> : (
            <SessionProviderWrapper>
              <AppShell user={{ name: session.user?.name, email: session.user?.email, isAdmin: !!session.user?.isAdmin }}>
                {children}
              </AppShell>
            </SessionProviderWrapper>
          )
        }
      </body>
    </html>
  );
}
