// Shop binding: mỗi staff/seller thuộc đúng 1 shop, biểu diễn bằng Keycloak group
// "/store-demo-{id}" (group mang attribute storeId). Group có trong token (mapper
// group-membership full-path trên client seller-workspace) -> session.user.groups.
//
// Trước đây ShopSell hardcode DEMO_STORE_ID=1. Nay suy storeId từ group của user,
// nên seller2/staff2 (group /store-demo-2) thao tác trên shop 2, không phải shop 1.

export type CurrentStore = {
  storeId: number;
  path: string;
  name: string;
};

// Suy store từ danh sách group của user. Lấy group "/store-*" đầu tiên (theo thiết kế
// một user chỉ thuộc 1 shop). Trả null nếu user không thuộc shop nào (vd admin nền tảng).
export function currentStore(groups: string[] | undefined): CurrentStore | null {
  for (const path of groups ?? []) {
    const match = /^\/store-[a-z0-9-]*?(\d+)$/i.exec(path);
    if (match) {
      const storeId = Number(match[1]);
      return { storeId, path, name: `Demo Shop ${storeId}` };
    }
  }
  return null;
}
