import { Roboto } from 'next/font/google'
import type { Metadata } from "next";
import "./globals.css";
import AppShell from '../../components/AppShell';
import { getServerSession } from "next-auth";
import { authOptions } from './lib/auth';
import Login from '../../components/Login';
import SessionProviderWrapper from "./SessionProviderWrapper";


const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: "Library",
  manifest: "/manifest.json",
  icons: { apple: "/icon.png" },
};

export const viewport = {
  themeColor: "#fff",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en">
      <body className={`${roboto.className}`}>
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
