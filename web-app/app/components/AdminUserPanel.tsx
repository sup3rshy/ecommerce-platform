"use client";

import { useMemo, useState } from "react";

type UserSummary = {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  roles: string[];
  orderCount: number;
  storeCount: number;
};

type SellerRequestSummary = {
  id: number;
  userId: string;
  storeName: string;
  requestedAt: string;
};

type AdminUserPanelProps = {
  initialUsers: UserSummary[];
  initialPendingRequests: SellerRequestSummary[];
};

export default function AdminUserPanel({ initialUsers, initialPendingRequests }: AdminUserPanelProps) {
  const [pendingRequests, setPendingRequests] = useState(initialPendingRequests);
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const userMap = useMemo(() => {
    return initialUsers.reduce<Record<string, UserSummary>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [initialUsers]);

  const approveRequest = async (requestId: number) => {
    setRequestError(null);
    setProcessingRequestId(requestId);

    try {
      const response = await fetch(`/api/admin/seller-requests/${requestId}/approve`, {
        method: "PATCH",
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setRequestError(payload?.error ?? "Không thể phê duyệt yêu cầu.");
        return;
      }

      setPendingRequests((prev) => prev.filter((item) => item.id !== requestId));
    } catch {
      setRequestError("Đã có lỗi xảy ra khi gửi yêu cầu phê duyệt.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Yêu cầu trở thành người bán</h2>
        <p className="mt-1 text-sm text-slate-600">Quản trị viên duyệt yêu cầu để cấp quyền seller trên Keycloak.</p>

        {requestError ? <p className="mt-3 text-sm text-red-600">{requestError}</p> : null}

        {pendingRequests.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Hiện không có yêu cầu chờ duyệt.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pendingRequests.map((request) => {
              const user = userMap[request.userId];
              const isProcessing = processingRequestId === request.id;

              return (
                <div key={request.id} className="rounded-lg border border-blue-100 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Yêu cầu #{request.id}</p>
                      <p className="text-sm text-slate-700">Người dùng: {user?.fullName ?? user?.username ?? request.userId}</p>
                      <p className="text-sm text-slate-700">Gian hàng đăng ký: {request.storeName}</p>
                      <p className="text-xs text-slate-500">Thời gian gửi: {request.requestedAt}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void approveRequest(request.id)}
                      className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isProcessing ? "Đang duyệt..." : "Phê duyệt"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-blue-100 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Chi tiết người dùng</h2>
        <p className="mt-1 text-sm text-slate-600">Bao gồm vai trò hiện tại, số đơn hàng và số gian hàng đang sở hữu.</p>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-blue-100 text-sm">
            <thead className="bg-blue-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2 font-medium">Người dùng</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Vai trò</th>
                <th className="px-3 py-2 font-medium">Số đơn hàng</th>
                <th className="px-3 py-2 font-medium">Số gian hàng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50">
              {initialUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-2 align-top">
                    <p className="font-semibold text-slate-900">{user.fullName ?? user.username ?? "Chưa đặt tên"}</p>
                    <p className="text-xs text-slate-500">{user.id}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{user.email ?? "Không có"}</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    {user.roles.length > 0 ? user.roles.join(", ") : "Không có"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{user.orderCount}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{user.storeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
