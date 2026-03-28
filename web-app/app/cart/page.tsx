import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "../api/auth/[...nextauth]/route";
import CartClient from "../components/CartClient";

export default async function CartPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-1 py-2 sm:px-2">
      <CartClient />
    </main>
  );
}
