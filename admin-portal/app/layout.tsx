import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getServerSession } from "next-auth";
import { authOptions } from "../lib/authOptions";
import { TopBar } from "./components/TopBar";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin", "vietnamese"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Admin Portal — Nhân sự nền tảng",
  description:
    "Cổng quản trị nhân sự nền tảng. Quản lý user/role + duyệt KYC qua Keycloak Admin API. SSO + SLO.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="vi" className={`${notoSans.variable} ${geistMono.variable}`}>
      <body>
        <Providers>
          <div className="container">
            <TopBar
              isAuthenticated={Boolean(session?.user?.id)}
              userName={session?.user?.name}
              roles={session?.user?.roles ?? []}
              idToken={session?.idToken as string | undefined}
            />
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
