import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Kiểm tra quyền truy cập trang người bán
    if (path.startsWith("/seller") && !token?.roles?.includes("seller")) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Kiểm tra quyền truy cập trang quản trị
    if (path.startsWith("/admin") && !token?.roles?.includes("admin")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  },
  {
    callbacks: {
      // Yêu cầu phải có token (đã đăng nhập) mới được đi qua middleware này
      authorized: ({ token }) => !!token,
    },
  }
);

// Áp dụng middleware này cho các tuyến đường cần bảo vệ
export const config = { matcher: ["/seller/:path*", "/admin/:path*"] };