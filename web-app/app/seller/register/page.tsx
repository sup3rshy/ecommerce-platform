import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "../../api/auth/[...nextauth]/route";
import SellerRegistrationForm from "../../components/SellerRegistrationForm";

export default async function SellerRegistrationPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];

  if (roles.includes("seller")) {
    redirect("/seller");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm uppercase tracking-[0.18em] text-sky-700">Seller Onboarding</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Đăng ký trở thành người bán</h1>
        <p className="mt-3 text-slate-600">
          Hoàn tất thông tin gian hàng để hệ thống tạo hồ sơ và tự động cấp quyền người bán cho tài khoản hiện tại.
        </p>

        {!roles.includes("buyer") ? (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            Tài khoản của bạn chưa có vai trò buyer mặc định nên không thể đăng ký gian hàng.
          </div>
        ) : (
          <div className="mt-6">
            <SellerRegistrationForm />
          </div>
        )}

        <div className="mt-8 border-t border-slate-100 pt-4 text-sm text-slate-500">
          Sau khi hoàn tất, bạn sẽ được yêu cầu đăng nhập lại để phiên làm việc nhận thêm vai trò seller.
        </div>

        <Link href="/" className="mt-4 inline-block text-sm font-medium text-sky-700 hover:text-sky-900">
          Quay về trang chủ
        </Link>
      </div>
    </main>
  );
}