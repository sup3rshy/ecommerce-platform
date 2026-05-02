import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
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
  title: "Seller Workspace",
  description: "Back-office quản lý shop, nhân viên, đơn hàng cho người bán.",
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
            />
            <main className="card">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
