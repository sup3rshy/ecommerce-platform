import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/authOptions";
import SellerRegistrationForm from "../../components/SellerRegistrationForm";
import { db } from "../../../db";
import { sellerUpgradeRequests } from "../../../db/schema";

export default async function FoodSellerRegistrationPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];

  // Đã là food-seller thì không cần đăng ký lại.
  if (roles.includes("food-seller")) {
    redirect("/");
  }

  const latestRequest = await db
    .select({
      status: sellerUpgradeRequests.status,
    })
    .from(sellerUpgradeRequests)
    .where(
      and(
        eq(sellerUpgradeRequests.userId, session.user.id),
        eq(sellerUpgradeRequests.kind, "food-seller")
      )
    )
    .orderBy(desc(sellerUpgradeRequests.requestedAt))
    .limit(1);

  const requestStatus = latestRequest[0]?.status ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm uppercase tracking-[0.18em] text-sky-700">Food Seller Onboarding</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Đăng ký bán đồ ăn (ShopFood)</h1>
        <p className="mt-3 text-slate-600">
          Gửi yêu cầu trở thành chủ nhà hàng trên ShopFood. Quản trị viên sẽ xem xét và phê duyệt trước khi cấp quyền food-seller.
        </p>

        {!roles.includes("buyer") ? (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            Tài khoản của bạn chưa có vai trò buyer mặc định nên không thể đăng ký bán đồ ăn.
          </div>
        ) : requestStatus === "pending" ? (
          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            Bạn đã gửi yêu cầu trở thành food-seller. Vui lòng chờ quản trị viên phê duyệt.
          </div>
        ) : requestStatus === "approved" ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            Yêu cầu của bạn đã được phê duyệt. Hãy đăng nhập lại để nhận quyền food-seller.
          </div>
        ) : (
          <div className="mt-6">
            <SellerRegistrationForm
              endpoint="/api/food-seller/register"
              fieldLabel="Tên nhà hàng"
              placeholder="Ví dụ: Bún Bò O Xuân"
              submitLabel="Hoàn tất đăng ký bán đồ ăn"
            />
          </div>
        )}

        <div className="mt-8 border-t border-slate-100 pt-4 text-sm text-slate-500">
          Khi yêu cầu được phê duyệt, phiên đăng nhập tiếp theo của bạn sẽ nhận thêm vai trò food-seller.
        </div>

        <Link href="/" className="mt-4 inline-block text-sm font-medium text-sky-700 hover:text-sky-900">
          Quay về trang chủ
        </Link>
      </div>
    </main>
  );
}
