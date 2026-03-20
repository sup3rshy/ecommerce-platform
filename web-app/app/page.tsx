import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "./api/auth/[...nextauth]/route";
import LogoutButton from "./components/LogoutButton";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles || [];

  let federatedLogoutUrl = "";
  if (session?.idToken && process.env.KEYCLOAK_ISSUER && process.env.NEXTAUTH_URL) {
    const logoutUrlObj = new URL(
      `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
    );
    logoutUrlObj.searchParams.set("id_token_hint", session.idToken as string);
    logoutUrlObj.searchParams.set("post_logout_redirect_uri", process.env.NEXTAUTH_URL);
    federatedLogoutUrl = logoutUrlObj.toString();
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Nền tảng thương mại</h1>
      
      {session ? (
        <div className="space-y-4">
          <p className="text-lg">Đã đăng nhập thành công!</p>
          <p>Tên: <span className="font-semibold">{session.user?.name}</span></p>
          <p>Vai trò: <span className="font-semibold">{roles.join(", ")}</span></p>
          
          <div className="flex gap-4 mt-4">
            {roles.includes("seller") && (
              <Link href="/seller" className="bg-green-600 text-white px-4 py-2 rounded">
                Vào trang Người Bán
              </Link>
            )}
            {roles.includes("admin") && (
              <Link href="/admin" className="bg-purple-600 text-white px-4 py-2 rounded">
                Vào trang Quản Trị
              </Link>
            )}
            <LogoutButton logoutUrl={federatedLogoutUrl} />
          </div>
        </div>
      ) : (
        <Link href="/api/auth/signin/keycloak" className="inline-block bg-blue-600 text-white px-4 py-2 rounded">
          Đăng nhập với Keycloak
        </Link>
      )}
    </main>
  );
}