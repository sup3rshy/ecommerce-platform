"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const ASSIGNABLE_ROLES = [
  "buyer",
  "seller",
  "admin",
  "wallet-user",
  "kyc-verified",
  "staff",
  "food-seller",
];
const HIDDEN_ROLES = new Set([
  "offline_access",
  "uma_authorization",
  "default-roles-ecommerce-realm",
]);

function UserRolesEditor({ user }: { user: { id: string; roles: string[] } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const visible = user.roles.filter((r) => !HIDDEN_ROLES.has(r));
  const available = ASSIGNABLE_ROLES.filter((r) => !visible.includes(r));

  async function call(action: "assign" | "revoke", role: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role, action }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert(`Lỗi: ${body.error ?? r.status}`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.length === 0 && (
        <span className="text-xs text-slate-400">Không có</span>
      )}
      {visible.map((r) => (
        <button
          key={r}
          onClick={() => call("revoke", r)}
          disabled={busy}
          className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800 hover:bg-red-100 hover:text-red-700 hover:line-through disabled:opacity-50"
          title={`Click để gỡ role ${r}`}
        >
          {r} ✕
        </button>
      ))}
      {available.length > 0 && (
        <select
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            const role = e.target.value;
            if (role) {
              call("assign", role);
              e.target.value = "";
            }
          }}
          className="text-xs border rounded px-1 py-0.5 disabled:opacity-50"
        >
          <option value="" disabled>
            + thêm
          </option>
          {available.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

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
  kind: string;
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

  const rejectRequest = async (requestId: number) => {
    const reason = prompt("Lý do từ chối (không bắt buộc):");
    if (reason === null) return;

    setRequestError(null);
    setProcessingRequestId(requestId);

    try {
      const response = await fetch(`/api/admin/seller-requests/${requestId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setRequestError(payload?.error ?? "Không thể từ chối yêu cầu.");
        return;
      }

      setPendingRequests((prev) => prev.filter((item) => item.id !== requestId));
    } catch {
      setRequestError("Đã có lỗi xảy ra khi gửi yêu cầu từ chối.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Yêu cầu nâng quyền (seller / food-seller)</h2>
        <p className="mt-1 text-sm text-slate-600">Quản trị viên duyệt yêu cầu để cấp quyền seller (ShopSell) hoặc food-seller (ShopFood) trên Keycloak.</p>

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
                      <p className="text-sm font-semibold text-slate-900">
                        Yêu cầu #{request.id}
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                          {request.kind === "food-seller" ? "food-seller" : "seller"}
                        </span>
                      </p>
                      <p className="text-sm text-slate-700">Người dùng: {user?.fullName ?? user?.username ?? request.userId}</p>
                      <p className="text-sm text-slate-700">
                        {request.kind === "food-seller" ? "Nhà hàng" : "Gian hàng"} đăng ký: {request.storeName}
                      </p>
                      <p className="text-xs text-slate-500">Thời gian gửi: {request.requestedAt}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void approveRequest(request.id)}
                        className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        {isProcessing ? "Đang xử lý..." : "Phê duyệt"}
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void rejectRequest(request.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-red-50/50"
                      >
                        Từ chối
                      </button>
                    </div>
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
                    <UserRolesEditor user={user} />
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
