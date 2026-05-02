import Link from "next/link";

type SuccessPageProps = {
  searchParams: Promise<{
    orderId?: string;
    product?: string;
    fromCart?: string;
    items?: string;
    total?: string;
  }>;
};

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto w-full max-w-3xl py-6">
      <div className="rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-md">
        <h1 className="mb-4 text-3xl font-bold text-blue-700">Thanh toán thành công!</h1>
        <p className="mb-6 text-gray-600">Cảm ơn bạn đã trải nghiệm hệ thống thanh toán mô phỏng.</p>
        {params.fromCart === "1" && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-gray-700">
            {params.items && <p>Tổng sản phẩm đã thanh toán: {params.items}</p>}
            {params.total && <p>Tổng tiền: {params.total} VNĐ</p>}
          </div>
        )}
        {params.orderId && (
          <p className="text-sm text-gray-500 mb-2">Mã đơn hàng: #{params.orderId}</p>
        )}
        {params.product && (
          <p className="text-sm text-gray-500 mb-6">Sản phẩm: {params.product}</p>
        )}
        <Link href="/" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded transition-colors">
          Quay lại trang chủ
        </Link>
      </div>
    </div>
  );
}