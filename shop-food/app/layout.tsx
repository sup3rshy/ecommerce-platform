import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { TopBar } from "./components/TopBar";

export const metadata: Metadata = {
  title: "ShopFood — Đặt món ăn",
  description: "App đặt món ăn trong hệ sinh thái ecommerce. SSO qua Keycloak.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="vi">
      <body>
        <Providers>
          <div className="container">
            <TopBar
              isAuthenticated={Boolean(session?.user?.id)}
              userName={session?.user?.name}
              roles={session?.user?.roles ?? []}
              idToken={session?.idToken as string | undefined}
            />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
