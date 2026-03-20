import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { stores, products, orders } from "../../db/schema";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import SellerOrdersPanel from "../components/SellerOrdersPanel";

type StoreProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
};

export default async function SellerDashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("seller")) {
    redirect("/");
  }

  // Truy vấn cơ sở dữ liệu xem người dùng này đã tạo gian hàng chưa
  const userStores = await db.select().from(stores).where(eq(stores.ownerId, session.user.id));
  const hasStore = userStores.length > 0;
  let storeProducts: StoreProduct[] = [];
  let storeOrders: Array<{
    id: number;
    buyerId: string;
    productName: string;
    price: number;
    status: string;
    createdAt: string;
  }> = [];

  if (hasStore) {
    storeProducts = await db.select().from(products).where(eq(products.storeId, userStores[0].id));

    const orderRows = await db
      .select({
        id: orders.id,
        buyerId: orders.userId,
        status: orders.status,
        createdAt: orders.createdAt,
        productName: products.name,
        price: products.price,
      })
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(stores, eq(products.storeId, stores.id))
      .where(and(eq(stores.ownerId, session.user.id), eq(stores.id, userStores[0].id)))
      .orderBy(desc(orders.createdAt));

    storeOrders = orderRows.map((order) => ({
      id: order.id,
      buyerId: order.buyerId,
      productName: order.productName,
      price: order.price,
      status: order.status ?? "pending",
      createdAt: order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Không rõ",
    }));
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Bảng điều khiển Người Bán</h1>
      
      {hasStore ? (
        <div className="p-4 border rounded shadow-sm">
          <h2 className="text-xl font-semibold">Gian hàng của bạn: {userStores[0].name}</h2>
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-3">Thêm sản phẩm mới</h3>
            <form className="flex flex-col gap-3 max-w-md" action={async (formData) => {
              "use server";
              const name = formData.get("name") as string;
              const price = Number(formData.get("price"));
              const description = formData.get("description") as string;
              
              if (name && price > 0) {
                await db.insert(products).values({
                  storeId: userStores[0].id,
                  name,
                  price,
                  description,
                });
                revalidatePath("/seller");
              }
            }}>
              <input type="text" name="name" placeholder="Tên sản phẩm" className="border p-2 rounded" required />
              <input type="number" name="price" placeholder="Giá tiền" className="border p-2 rounded" required />
              <textarea name="description" placeholder="Mô tả sản phẩm" className="border p-2 rounded"></textarea>
              <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded w-fit">
                Thêm sản phẩm
              </button>
            </form>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-medium mb-3">Danh sách sản phẩm</h3>
            {storeProducts.length > 0 ? (
              <ul className="space-y-2">
                {storeProducts.map((product) => (
                  <li key={product.id} className="border p-3 rounded flex justify-between items-center bg-white">
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.description}</p>
                    </div>
                    <span className="font-bold text-blue-600">{product.price} VNĐ</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">Chưa có sản phẩm nào.</p>
            )}
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-medium mb-3">Đơn hàng của gian hàng</h3>
            <SellerOrdersPanel initialOrders={storeOrders} />
          </div>
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