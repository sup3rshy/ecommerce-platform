import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { stores } from "../../db/schema";
import { eq } from "drizzle-orm";

export default async function SellerDashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user.id) {
    redirect("/");
  }

  // Truy vấn cơ sở dữ liệu xem người dùng này đã tạo gian hàng chưa
  const userStores = await db.select().from(stores).where(eq(stores.ownerId, session.user.id));
  const hasStore = userStores.length > 0;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Bảng điều khiển Người Bán</h1>
      
      {hasStore ? (
        <div className="p-4 border rounded shadow-sm">
          <h2 className="text-xl font-semibold">Gian hàng của bạn: {userStores[0].name}</h2>
          <p className="text-gray-600 mt-2">Tính năng thêm sản phẩm sẽ được đặt tại đây.</p>
        </div>
      ) : (
        <div className="p-4 border rounded bg-gray-50">
          <p className="mb-4">Bạn chưa thiết lập gian hàng nào.</p>
          <form className="flex gap-2" action={async (formData) => {
            "use server";
            const storeName = formData.get("name") as string;
            if (storeName && session.user.id) {
              await db.insert(stores).values({
                ownerId: session.user.id,
                name: storeName,
              });
              redirect("/seller");
            }
          }}>
            <input 
              type="text" 
              name="name" 
              placeholder="Nhập tên gian hàng mới..." 
              className="border p-2 rounded w-64"
              required 
            />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
              Tạo gian hàng
            </button>
          </form>
        </div>
      )}
    </div>
  );
}