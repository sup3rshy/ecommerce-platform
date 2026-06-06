# Active Directory (LDAP federation) — chạy LOCAL bằng VMware

Hướng dẫn đưa **nhân sự nền tảng** (`admin`, `ecommerce_admin`, `food_admin`, `pay_admin`)
từ **Windows Server Active Directory** vào Keycloak qua **LDAP user federation**. Giai đoạn này
chỉ chạy **trên máy local** (DC trong VMware), CHƯA cần VPS/Tailscale.

Quyết định cốt lõi (xem [CONTEXT.md](../CONTEXT.md) mục 3):

- AD chỉ cấp danh tính cho **admin / *_admin**. `buyer`, `seller`, `staff`, `food-seller`,
  `wallet-user`, `kyc-verified` vẫn nằm trong Keycloak (PostgreSQL) như hiện tại.
- AD **group** map sang **realm role** admin tương ứng.
- Xoá user khỏi AD => không federate được => refresh token thất bại => mất quyền toàn hệ sinh thái.
- DC chỉ đóng 1 vai trò: cung cấp định danh.

Domain ví dụ dùng xuyên suốt: **`ecommerce.local`** (NetBIOS `ECOMMERCE`). Đổi cho khớp môi trường của bạn.

---

## 0. Mô hình mạng local (QUAN TRỌNG)

```
┌─ Máy thật (Windows) ───────────────────────────────────────────────┐
│                                                                     │
│   VMware ── Windows Server 2016/2019/2022 (DC: dc01.ecommerce.local)│
│              card mạng = Bridged  ->  IP LAN, vd 192.168.1.50       │
│                                                                     │
│   WSL2 ── Docker ── Keycloak (:8080)  ──LDAP──> 192.168.1.50:389    │
│                     Postgres, Nginx                                 │
└─────────────────────────────────────────────────────────────────-─┘
```

- Đặt card mạng của VM AD = **Bridged** để VM có IP cùng dải LAN với máy thật. Đây là cách
  để Keycloak (Docker trong WSL2) gọi tới được DC: WSL2 định tuyến ra LAN qua máy host, nên
  IP LAN của VM truy cập được từ trong container.
- Nếu buộc dùng **NAT**: VM nằm trên subnet riêng của VMware (vmnet8), khó với tới từ WSL2 —
  ưu tiên Bridged cho đơn giản.
- Đặt **IP tĩnh** cho DC (AD DS yêu cầu IP ổn định). Ghi lại IP này, sẽ dùng làm `LDAP_CONNECTION_URL`.

---

## 1. Dựng Domain Controller trong VMware

1. Tạo VM Windows Server 2016/2019/2022, 2 vCPU / 4GB RAM là đủ cho lab.
2. Card mạng = **Bridged**. Đặt IP tĩnh, vd `192.168.1.50`, DNS trỏ về chính nó (`127.0.0.1`).
3. Cài role **Active Directory Domain Services** (Server Manager > Add Roles).
4. Promote thành DC, tạo forest mới: domain root **`ecommerce.local`**. Đặt mật khẩu DSRM.
5. Sau khi reboot, đăng nhập `ECOMMERCE\Administrator`. Mở **Active Directory Users and Computers** (ADUC).

---

## 2. Tạo OU, Group, User, Service Account trong AD

Mở ADUC (hoặc PowerShell). Cấu trúc khớp với `.env.example`:

| Đối tượng | DN | Mục đích |
| --- | --- | --- |
| OU `Admins` | `OU=Admins,DC=ecommerce,DC=local` | chứa user nhân sự nền tảng |
| OU `Groups` | `OU=Groups,DC=ecommerce,DC=local` | chứa group map sang role |
| OU `ServiceAccounts` | `OU=ServiceAccounts,DC=ecommerce,DC=local` | chứa account bind cho Keycloak |

**Service account cho Keycloak bind** (chỉ cần quyền đọc):

- User `keycloak-svc` trong `OU=ServiceAccounts`. Đặt mật khẩu, bật "Password never expires".
- DN: `CN=keycloak-svc,OU=ServiceAccounts,DC=ecommerce,DC=local`.

**Group → Role** (tạo trong `OU=Groups`, loại Security - Global):

| AD Group | Realm role sẽ map | Quyền |
| --- | --- | --- |
| `Platform-Admins` | `admin` | toàn quyền nền tảng |
| `Ecommerce-Admins` | `ecommerce_admin` | quản trị Ecommerce (ShopEcommerce + ShopSell) |
| `Food-Admins` | `food_admin` | quản trị ShopFood |
| `Pay-Admins` | `pay_admin` | quản trị ShopPay + duyệt KYC |

**User mẫu** (trong `OU=Admins`), thêm vào group tương ứng. Ví dụ PowerShell:

```powershell
# Chạy trên DC (PowerShell as Administrator)
$ou = "OU=Admins,DC=ecommerce,DC=local"
New-ADUser -Name "ad-admin"  -SamAccountName "ad-admin"  -UserPrincipalName "ad-admin@ecommerce.local" `
  -Path $ou -AccountPassword (ConvertTo-SecureString "P@ssw0rd!2024" -AsPlainText -Force) -Enabled $true -EmailAddress "ad-admin@ecommerce.local"
Add-ADGroupMember -Identity "Platform-Admins" -Members "ad-admin"

New-ADUser -Name "ad-ecommerce" -SamAccountName "ad-ecommerce" -UserPrincipalName "ad-ecommerce@ecommerce.local" `
  -Path $ou -AccountPassword (ConvertTo-SecureString "P@ssw0rd!2024" -AsPlainText -Force) -Enabled $true -EmailAddress "ad-ecommerce@ecommerce.local"
Add-ADGroupMember -Identity "Ecommerce-Admins" -Members "ad-ecommerce"
```

> AD bắt buộc UPN/email + mật khẩu đủ mạnh. Email cần có để Keycloak map sang user (tránh trùng `editUsernameAllowed`).

---

## 3. Kiểm tra Keycloak (Docker/WSL2) tới được DC

Lấy IP DC (vd `192.168.1.50`). Trên DC, mở firewall cho LDAP:

```powershell
New-NetFirewallRule -DisplayName "LDAP 389" -Direction Inbound -Protocol TCP -LocalPort 389 -Action Allow
```

Từ WSL2 (host):

```bash
nc -vz 192.168.1.50 389         # hoặc: timeout 3 bash -c '</dev/tcp/192.168.1.50/389' && echo OPEN
```

Từ trong container Keycloak (đảm bảo container cũng tới được — đây mới là đường thật):

```bash
docker compose exec keycloak bash -c 'timeout 3 bash -c "</dev/tcp/192.168.1.50/389" && echo REACHABLE || echo UNREACHABLE'
```

Nếu `UNREACHABLE`: kiểm tra card mạng VM = Bridged, IP DC, firewall DC, và `ping` được IP DC từ WSL2 chưa.

---

## 4. Cấu hình User Federation (LDAP) trong Keycloak

Keycloak Admin Console (`http://localhost:8080`) > realm **`ecommerce-realm`** > **User Federation** > **Add Ldap providers**:

| Field | Giá trị |
| --- | --- |
| Vendor | **Active Directory** |
| Connection URL | `ldap://192.168.1.50:389` (IP DC của bạn) |
| Bind type | simple |
| Bind DN | `CN=keycloak-svc,OU=ServiceAccounts,DC=ecommerce,DC=local` |
| Bind credentials | mật khẩu `keycloak-svc` |
| Edit mode | **READ_ONLY** (AD là nguồn truth, Keycloak không ghi ngược) |
| Users DN | `OU=Admins,DC=ecommerce,DC=local` |
| Username LDAP attribute | `sAMAccountName` |
| RDN LDAP attribute | `cn` |
| UUID LDAP attribute | `objectGUID` |
| User object classes | `person, organizationalPerson, user` |

Bấm **Test connection** và **Test authentication** (phải xanh). **Save**, rồi **Synchronize all users**
để kéo user AD vào Keycloak. Kiểm tra: realm > Users thấy `ad-admin`, `ad-ecommerce`, ...

> Các giá trị trên trùng với placeholder `LDAP_*` trong [.env.example](../.env.example). `.env` chỉ
> để tham chiếu/ghi chú; cấu hình thật nhập trực tiếp trong Console (federation không đọc từ `.env`).

---

## 5. Map AD group sang realm role

Trong LDAP provider vừa tạo > tab **Mappers** > **Add mapper**, kiểu **group-ldap-mapper**:

| Field | Giá trị |
| --- | --- |
| Name | `ad-groups` |
| LDAP Groups DN | `OU=Groups,DC=ecommerce,DC=local` |
| Group Name LDAP Attribute | `cn` |
| Group Object Classes | `group` |
| Membership LDAP Attribute | `member` |
| Membership Attribute Type | `DN` |
| Mode | `READ_ONLY` |
| User Groups Retrieve Strategy | `LOAD_GROUPS_BY_MEMBER_ATTRIBUTE` |

**Sync LDAP Groups To Keycloak**. Giờ realm > Groups có `Platform-Admins`, `Ecommerce-Admins`, ...

Gán realm role cho từng group đã import: realm > **Groups** > chọn `Platform-Admins` > tab
**Role mapping** > **Assign role** > chọn `admin`. Làm tương tự:

- `Platform-Admins`  -> `admin`
- `Ecommerce-Admins` -> `ecommerce_admin`
- `Food-Admins`      -> `food_admin`
- `Pay-Admins`       -> `pay_admin`

Vì user AD là member của group, đăng nhập sẽ nhận realm role qua group → có trong `realm_access.roles`.

> Cách khác: dùng **role-ldap-mapper** map thẳng LDAP group → realm role. group-ldap-mapper +
> Role mapping linh hoạt hơn (tên group AD không cần trùng tên role) nên dùng cách này.

---

## 6. Test đăng nhập bằng tài khoản AD

1. Mở app bất kỳ (vd Admin Portal `http://localhost:3400`) > Đăng nhập SSO.
2. Ở trang login Keycloak nhập `ad-admin` / mật khẩu AD (hoặc `ad-admin@ecommerce.local`).
3. Vào được Admin Portal với quyền `admin`. Đổi `ad-ecommerce` thì chỉ thấy phạm vi `ecommerce_admin`.

Kiểm tra nhanh token (direct grant không bật cho user AD; xem qua app hoặc Account Console):
realm > Users > `ad-admin` > Role mapping thấy `admin` (kế thừa qua group `Platform-Admins`).

Lúc này có thể **bỏ `admin1` Keycloak-local** (chỉ giữ để fallback khi DC tắt). Danh tính admin
thật đến từ AD.

---

## 7. Deprovisioning (xoá quyền khi rời tổ chức)

- Disable/Delete user trong AD, hoặc gỡ khỏi group.
- Token hiện tại còn sống tới khi hết hạn (access token TTL 5 phút — xem realm Tokens).
  Lần refresh kế tiếp Keycloak federate lại AD: user bị disable/xoá => refresh fail => app coi như logged-out.
- Muốn nhanh hơn: giảm SSO session / access token TTL, hoặc revoke session trong Keycloak.

---

## 8. Lỗi thường gặp

| Triệu chứng | Nguyên nhân / xử lý |
| --- | --- |
| Test connection fail | Sai IP/port; VM không Bridged; firewall DC chặn 389; WSL2 chưa ping được DC |
| Test authentication fail | Sai Bind DN/mật khẩu `keycloak-svc`; account bị khoá/hết hạn |
| Sync 0 user | Sai Users DN (OU); user nằm ngoài `OU=Admins`; sai object classes |
| User login nhưng không có role | Chưa chạy group-ldap-mapper sync; chưa gán realm role cho group; user chưa là member |
| `Invalid credentials` dù đúng pass | Đồng hồ DC vs máy host lệch giờ (Kerberos/AD nhạy thời gian) — sync NTP |
| LDAPS (636) | Lab dùng `ldap://:389` cho đơn giản. Production nên LDAPS: import cert AD CA vào truststore Keycloak |

---

## 9. Kerberos/SPNEGO Desktop SSO

LDAP federation chỉ giúp user AD đăng nhập bằng username/password trên trang Keycloak. Luồng
"đăng nhập Win10 bằng tài khoản domain rồi vào web tự nhận tài khoản" cần Kerberos/SPNEGO,
hostname LAN và portproxy từ Win10 VM vào WSL. Runbook hiện tại: [desktop-sso-kerberos.md](desktop-sso-kerberos.md).

## 10. Liên hệ phase sau

- **VPS + Tailscale**: khi deploy lên cloud, DC vẫn ở local, nối qua Tailscale; chỉ đổi
  `LDAP_CONNECTION_URL` sang IP Tailscale của DC. Hiện tại bỏ qua (chạy local).
