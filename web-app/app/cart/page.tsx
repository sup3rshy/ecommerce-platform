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
    <main className="p-8 max-w-4xl mx-auto w-full">
      <CartClient />
    </main>
  );
}
