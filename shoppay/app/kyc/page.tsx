import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { db } from "@/db";
import { kycDocuments } from "@/db/schema";

async function submitKyc(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");

  const fullName = String(formData.get("fullName") ?? "").trim();
  const docType = String(formData.get("docType") ?? "");
  const docNumber = String(formData.get("docNumber") ?? "").trim();
  if (!fullName || !docType || !docNumber) return;

  await db
    .insert(kycDocuments)
    .values({
      userId: session.user.id,
      fullName,
      docType,
      docNumber,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: kycDocuments.userId,
      set: {
        fullName,
        docType,
        docNumber,
        status: "pending",
        submittedAt: new Date(),
        reviewedAt: null,
        reviewerNote: null,
      },
    });

  revalidatePath("/kyc");
  revalidatePath("/wallet");
}

const STATUS_LABEL: Record<string, [string, string]> = {
  pending: ["Chờ duyệt", "#92400e"],
  approved: ["Đã duyệt", "#065f46"],
  rejected: ["Bị từ chối", "#991b1b"],
};

export default async function KycPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");

  const existing = await db
    .select()
    .from(kycDocuments)
    .where(eq(kycDocuments.userId, session.user.id))
    .limit(1);
  const doc = existing[0];

  return (
    <div>
      <h1>Xác minh KYC</h1>
      <p className="muted">
        Nộp giấy tờ để mở giới hạn giao dịch &gt; 5 triệu VND/lần và nhận role{" "}
        <code className="code-inline">kyc-verified</code>.
      </p>

      {doc && (
        <section className="card">
          <h2>Hồ sơ hiện tại</h2>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr",
              gap: "8px 12px",
              fontSize: 14,
              margin: 0,
            }}
          >
            <dt className="muted">Họ tên</dt>
            <dd style={{ margin: 0 }}>{doc.fullName}</dd>
            <dt className="muted">Loại giấy tờ</dt>
            <dd style={{ margin: 0 }}>
              <code className="code-inline">{doc.docType}</code>
            </dd>
            <dt className="muted">Số giấy tờ</dt>
            <dd style={{ margin: 0 }}>
              <code className="code-inline">{doc.docNumber}</code>
            </dd>
            <dt className="muted">Trạng thái</dt>
            <dd style={{ margin: 0, color: STATUS_LABEL[doc.status]?.[1] ?? "#475569" }}>
              <strong>{STATUS_LABEL[doc.status]?.[0] ?? doc.status}</strong>
            </dd>
            <dt className="muted">Nộp lúc</dt>
            <dd style={{ margin: 0 }}>
              {doc.submittedAt?.toLocaleString("vi-VN") ?? "-"}
            </dd>
          </dl>
          {doc.reviewerNote && (
            <p className="muted" style={{ marginTop: 12 }}>
              Ghi chú reviewer: {doc.reviewerNote}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>{doc ? "Cập nhật / nộp lại" : "Nộp KYC mới"}</h2>
        <form action={submitKyc} style={{ display: "grid", gap: 12 }}>
          <input
            name="fullName"
            placeholder="Họ và tên đầy đủ"
            required
            defaultValue={doc?.fullName ?? session.user.name ?? ""}
          />
          <select name="docType" required defaultValue={doc?.docType ?? "cccd"}>
            <option value="cccd">CCCD</option>
            <option value="passport">Hộ chiếu</option>
          </select>
          <input
            name="docNumber"
            placeholder="Số CCCD / hộ chiếu"
            required
            defaultValue={doc?.docNumber ?? ""}
          />
          <button type="submit" className="btn btn-primary">
            Gửi xác minh
          </button>
        </form>
      </section>

      <div className="alert-info">
        💡 Trong production: reviewer (admin) sẽ approve qua admin panel, sau
        đó gọi <strong>Keycloak Admin API</strong> để gán role
        <code className="code-inline">kyc-verified</code> cho user. Hiện chưa
        wire bước approve — bạn có thể đổi status thủ công trong DB để demo.
      </div>
    </div>
  );
}
