import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "../../api/auth/[...nextauth]/route";
import SellerRegistrationForm from "../../components/SellerRegistrationForm";
import { db } from "../../../db";
import { sellerUpgradeRequests } from "../../../db/schema";

export default async function SellerRegistrationPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];

  if (roles.includes("seller")) {
    redirect("/seller");
  }

  const latestRequest = await db
    .select({
      status: sellerUpgradeRequests.status,
      requestedAt: sellerUpgradeRequests.requestedAt,
      adminNote: sellerUpgradeRequests.adminNote,
    })
    .from(sellerUpgradeRequests)
    .where(eq(sellerUpgradeRequests.userId, session.user.id))
    .orderBy(desc(sellerUpgradeRequests.requestedAt))
    .limit(1);

  const requestStatus = latestRequest[0]?.status ?? null;
  const rejectionNote = latestRequest[0]?.adminNote ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm uppercase tracking-[0.18em] text-sky-700">Seller Onboarding</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Đăng ký trở thành người bán</h1>
        <p className="mt-3 text-slate-600">
          Hoàn tất thông tin gian hàng để gửi yêu cầu nâng quyền. Quản trị viên sẽ xem xét và phê duyệt trước khi bạn trở thành người bán.
        </p>

        {!roles.includes("buyer") ? (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            Tài khoản của bạn chưa có vai trò buyer mặc định nên không thể đăng ký gian hàng.
          </div>
        ) : requestStatus === "pending" ? (
          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            Bạn đã gửi yêu cầu trở thành seller. Vui lòng chờ quản trị viên phê duyệt.
          </div>
        ) : requestStatus === "approved" ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            Yêu cầu của bạn đã được phê duyệt. Hãy đăng nhập lại để nhận quyền seller.
          </div>
        ) : (
          <div className="mt-6">
            {requestStatus === "rejected" && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                <p className="font-medium">Yêu cầu trước đó đã bị từ chối.</p>
                {rejectionNote && <p className="mt-1 text-sm">Lý do: {rejectionNote}</p>}
                <p className="mt-1 text-sm">Bạn có thể gửi lại yêu cầu mới bên dưới.</p>
              </div>
            )}
            <SellerRegistrationForm />
          </div>
        )}

        <div className="mt-8 border-t border-slate-100 pt-4 text-sm text-slate-500">
          Khi yêu cầu được phê duyệt, phiên đăng nhập tiếp theo của bạn sẽ nhận thêm vai trò seller.
        </div>

        <Link href="/" className="mt-4 inline-block text-sm font-medium text-sky-700 hover:text-sky-900">
          Quay về trang chủ
        </Link>
      </div>
    </main>
  );
}