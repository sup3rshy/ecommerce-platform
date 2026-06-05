import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";

import { authOptions } from "./api/auth/[...nextauth]/route";
import SidebarNav from "./components/SidebarNav";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ecommerce Platform",
  description: "Nền tảng thương mại điện tử đa vai trò với giao diện tối ưu trải nghiệm.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html
      lang="en"
      className={`${notoSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#f8fbff_55%,_#ffffff_100%)] text-slate-900">
        <Providers>
          <AppShell session={session}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

function AppShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1500px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[280px_minmax(0,_1fr)] lg:gap-6 lg:px-8">
      <SidebarNav
        isAuthenticated={Boolean(session?.user?.id)}
        userName={session?.user?.name}
        roles={session?.user?.roles ?? []}
        idToken={session?.idToken}
      />
      <div className="min-w-0 rounded-2xl border border-blue-100/80 bg-white/80 p-3 shadow-sm backdrop-blur sm:p-5 lg:p-6">
        {children}
      </div>
    </div>
  );
}
