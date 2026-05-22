# PLAN - Kiến trúc và quyết định thiết kế

Tài liệu này giải thích "vì sao" hệ thống được thiết kế như hiện tại. Hướng dẫn chạy và demo nằm trong [README.md](README.md); danh sách việc còn lại nằm trong [TODO.md](TODO.md).

## 1. Mục tiêu

Repo mô phỏng một hệ sinh thái ecommerce gồm 3 ứng dụng độc lập nhưng dùng chung danh tính:

| Ứng dụng | Port | Mục đích |
| --- | --- | --- |
| `web-app` | 3000 | Marketplace cho buyer, seller và admin |
| `seller-workspace` | 3100 | Back-office cho seller và nhân viên shop |
| `shoppay` | 3200 | Ví điện tử, KYC, nạp tiền, thanh toán |

Keycloak đóng vai trò IdP trung tâm cho SSO, MFA, SAML brokering, role/group mapping và Single Logout.

## 2. Ranh giới kiến trúc

Hệ thống tách 3 lớp rõ ràng:

- Identity plane: Keycloak realm `ecommerce-realm`, mock enterprise realm `acme-corp-realm`, roles, groups, auth flows, IdP brokering.
- App plane: 3 Next.js app dùng NextAuth v4, mỗi app có cookie riêng để không đè lên nhau trên `localhost`.
- Data plane: `postgres-keycloak` nội bộ cho Keycloak và `postgres-app` expose `:5432` cho DB ứng dụng.

Quyết định tách Postgres giúp tránh trộn lẫn lifecycle: reset Keycloak realm không đồng nghĩa với reset dữ liệu app, và ngược lại.

## 3. Secrets và realm import

Realm export từ Keycloak thường nhúng plaintext client secret. Repo này không commit secret trực tiếp trong realm JSON:

- Root `.env` chứa secret runtime.
- `keycloak/ecommerce-realm.json` và `keycloak/acme-corp-realm.json` dùng placeholder `${VAR_NAME}`.
- `keycloak/entrypoint.sh` resolve placeholder trước khi Keycloak import realm.
- `scripts/bootstrap.sh` sinh secret và sync `.env` cho 3 app.

Trade-off: `.env` phù hợp local demo, không phải production-grade. Production nên dùng Vault, Doppler, AWS Secrets Manager hoặc secret của orchestrator.

## 4. OIDC SSO giữa 3 app

Mỗi app là một confidential OIDC client riêng:

- `nextjs-app` cho `web-app`.
- `seller-workspace` cho back-office.
- `shoppay-app` cho ví điện tử.

Mỗi app dùng NextAuth JWT session. Cookie được đặt tên riêng:

- `ecommerce.session-token`
- `seller-workspace.session-token`
- `shoppay.session-token`

Lý do: cả 3 app chạy trên `localhost` với port khác nhau. Nếu dùng cookie mặc định của NextAuth, cookie có thể đè lên nhau và làm sai session.

## 5. Refresh token rotation và stale session

Keycloak access token ngắn hạn. NextAuth không tự refresh, nên mỗi app có `lib/refreshAccessToken.ts`.

Luôn xử lý 3 trường hợp:

- Access token còn hạn: giữ nguyên.
- Gần hết hạn: gọi Keycloak token endpoint với `grant_type=refresh_token`.
- Refresh fail do `invalid_grant`, `Session not active`, revoke session: đánh dấu `RefreshAccessTokenError`.

Sau fix mới, app không refresh lặp vô hạn và không ném `console.error` trong server render gây Next dev overlay. Session callback coi token lỗi như logged-out, proxy cũng redirect về signin nếu gặp stale JWT.

## 6. ShopPay MFA per-client

ShopPay cần bảo mật cao hơn marketplace. Thay vì bắt TOTP toàn realm, repo bind authentication flow riêng cho client `shoppay-app`:

- Flow `browser-shoppay`.
- Không dựa vào `auth-cookie` silent login như client thường.
- Username/password và OTP là required trong flow ShopPay.
- `userSetupAllowed=true` để user chưa có TOTP được setup lần đầu.

Trade-off: đây là client-specific MFA enforcement, không phải step-up theo từng action. Production có thể nâng cấp sang ACR/AMR step-up: chỉ yêu cầu MFA khi topup lớn, pay, đổi PIN, rút tiền.

## 7. SAML brokering với `acme-corp-realm`

Để demo B2B identity brokering mà không cần Azure AD/Okta thật, repo dùng realm thứ hai `acme-corp-realm` làm mock company IdP.

Luồng đi như sau:

1. User vào `seller-workspace`.
2. Keycloak `ecommerce-realm` hiện nút "Sign in with Acme Corp".
3. Browser sang `acme-corp-realm` qua SAML.
4. Acme xác thực user và POST SAML Response về broker endpoint.
5. `ecommerce-realm` tạo/link user và mapper role `seller`.

Production cần bật signed assertions, cert rotation và metadata endpoint từ IdP thật.

## 8. Cross-app payment với HMAC

`web-app` redirect sang `shoppay` để thanh toán. Query string có thể bị user sửa, nên hai app ký payload bằng HMAC-SHA256 với `MERCHANT_HMAC_SECRET`.

Pattern:

- Ecommerce tạo payment URL với `merchant`, `orderId`, `amount`, `returnUrl`, `nonce`, `sig`.
- ShopPay verify signature khi render và verify lại trong server action.
- ShopPay trừ ví idempotent theo external ref `merchant:orderId`.
- Return URL về ecommerce cũng có signature riêng để update order.

Trade-off: HMAC là symmetric secret; nếu một bên leak secret thì bên đó có thể forge. Production PSP thường dùng asymmetric signature.

## 9. KYC và giao dịch giá trị cao

Business rule: giao dịch ShopPay trên 5.000.000 VND cần KYC.

Action topup check `session.user.roles.includes("kyc-verified")`. Đây là cách cố ý để chứng minh role claim trong token là snapshot tại thời điểm login.

Quyết định hiện tại:

- `approveKyc` cập nhật DB và luôn gọi Keycloak Admin API gán role, kể cả khi document đã `approved`.
- `topup` > 5 triệu chỉ cho qua khi token hiện tại đã có role `kyc-verified`.
- Sau khi admin duyệt KYC, user cần logout/login lại để nhận token mới có role vừa được gán.

## 10. Frontchannel logout và giới hạn của browser

Keycloak frontchannel logout gọi iframe ẩn tới mỗi client:

- `http://localhost:3000/api/auth/frontchannel-logout`
- `http://localhost:3100/api/auth/frontchannel-logout`
- `http://localhost:3200/api/auth/frontchannel-logout`

Endpoint xoá cookie NextAuth và các cookie transient (`csrf`, `callback`, `pkce`, `state`, `nonce`). Để tránh browser chặn Set-Cookie trong iframe làm tab active vẫn còn session, endpoint còn ghi marker `localStorage`. Client component `SingleLogoutWatcher` lắng nghe marker và gọi `signOut({ redirect: false })`, sau đó reload tab.

Trade-off: frontchannel vẫn phụ thuộc browser. Production nên có backchannel logout: verify `logout_token`, lưu revoked `sid` trong DB, và check trong session/proxy.

## 11. User profile cache

Mỗi app có bảng `user_profile` để cache sub, email, name, roles, groups khi login. Mục tiêu là giảm gọi Keycloak Admin API trên mỗi request và có đủ thông tin cho audit/business logic.

Trade-off: data có thể stale nếu admin sửa user ngoài luồng login. Nếu cần consistency mạnh, nên viết Keycloak Event Listener SPI hoặc webhook để sync UserUpdated/UserDeleted.

## 12. Windows Server Domain Controller — Enterprise SSO

### 12.1 Mục tiêu

Demo kịch bản enterprise thực tế: công ty (ví dụ "Acme Corp") quản lý nhân viên bằng Active Directory. Khi nhân viên truy cập hệ sinh thái ecommerce (seller-workspace, web-app), họ đăng nhập bằng AD credentials thông qua Keycloak identity brokering — thay thế mock `acme-corp-realm` hiện tại bằng Windows Server AD DS thật.

### 12.2 Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────┐
│                    Mạng nội bộ (NAT/Bridge)                 │
│                                                             │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ Windows Server  │     │   Host machine  │               │
│  │ 2022/2025       │     │   (dev machine) │               │
│  │                 │     │                 │               │
│  │ • AD DS (DC)    │     │ • Keycloak:8080 │               │
│  │ • DNS Server    │     │ • web-app:3000  │               │
│  │ • DHCP (opt.)   │     │ • seller:3100   │               │
│  │ • CA (opt.)     │     │ • shoppay:3200  │               │
│  │                 │     │ • Postgres      │               │
│  │ IP: 192.168.x.10│     │ IP: 192.168.x.1│               │
│  └─────────────────┘     └─────────────────┘               │
│           │                       │                         │
│           │  LDAP(S)/SAML/OIDC    │                         │
│           └───────────────────────┘                         │
│                                                             │
│  ┌─────────────────┐                                        │
│  │ Windows 10/11   │  (optional)                            │
│  │ Client VM       │  Join domain, test GPO                 │
│  │ IP: DHCP        │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

### 12.3 Các thành phần Windows Server

#### A. AD DS (Active Directory Domain Services)

| Cấu hình | Giá trị |
|---|---|
| Domain name | `acme.local` |
| NetBIOS | `ACME` |
| Forest/Domain functional level | Windows Server 2016+ |
| DC hostname | `DC01.acme.local` |
| Admin | `ACME\Administrator` |

OU (Organizational Unit) structure:

```
acme.local
├── OU=Employees
│   ├── OU=Management
│   ├── OU=Sellers        ← map → Keycloak role "seller"
│   ├── OU=Warehouse      ← map → role "staff-warehouse"
│   ├── OU=CS             ← map → role "staff-cs"
│   └── OU=Finance        ← map → role "staff-finance"
├── OU=ServiceAccounts
│   └── svc-keycloak      ← bind account cho LDAP Federation
└── OU=Groups
    ├── GG-Sellers
    ├── GG-Warehouse
    ├── GG-CS
    └── GG-Finance
```

User demo (tương đương user trong acme-corp-realm hiện tại):

| Username | Full name | OU | Group | Password |
|---|---|---|---|---|
| john.doe | John Doe | Sellers | GG-Sellers | Acme@2024 |
| jane.smith | Jane Smith | Sellers | GG-Sellers | Acme@2024 |
| bob.warehouse | Bob Tran | Warehouse | GG-Warehouse | Acme@2024 |
| alice.cs | Alice Nguyen | CS | GG-CS | Acme@2024 |
| eve.finance | Eve Le | Finance | GG-Finance | Acme@2024 |

#### B. DNS Server

- Primary zone: `acme.local`
- Forwarder: `8.8.8.8` / `1.1.1.1` (để VM vẫn ra Internet)
- Conditional forwarder (nếu cần): `localhost` zone trỏ về host machine cho Keycloak

#### C. Group Policy (GPO) — demo

| GPO | Mục đích |
|---|---|
| Password Policy | Minimum 8 chars, complexity, 90-day expiry |
| Account Lockout | 5 failed → lock 15 min |
| Desktop Wallpaper | Brand Acme Corp wallpaper (chứng minh GPO hoạt động) |
| Software Restriction | Block cmd.exe cho user thường (demo security) |

#### D. Certificate Authority (optional)

- AD CS role → Enterprise Root CA
- Dùng để issue cert cho LDAPS (port 636) thay vì LDAP plaintext (389)
- Keycloak trust CA cert này khi cấu hình LDAP Federation

### 12.4 Tích hợp Keycloak ↔ AD

Có 2 cách, nên làm **cả hai** để demo khác nhau:

#### Cách 1: LDAP User Federation (sync user)

Keycloak kết nối AD qua LDAP, sync user về `ecommerce-realm`:

| Setting | Value |
|---|---|
| Vendor | Active Directory |
| Connection URL | `ldap://192.168.x.10:389` hoặc `ldaps://...:636` |
| Bind DN | `CN=svc-keycloak,OU=ServiceAccounts,DC=acme,DC=local` |
| Bind credential | (password của svc-keycloak) |
| Users DN | `OU=Employees,DC=acme,DC=local` |
| Username LDAP attribute | `sAMAccountName` |
| UUID LDAP attribute | `objectGUID` |
| User Object Classes | `person, organizationalPerson, user` |
| Search scope | Subtree |
| Import users | ON (sync về Keycloak) |
| Sync period | 300s (hoặc manual) |

Mapper quan trọng:

| Mapper | Type | Mục đích |
|---|---|---|
| group-mapper | group-ldap-mapper | AD group → Keycloak group |
| role-mapper | hardcoded-role / role-ldap-mapper | GG-Sellers → role `seller` |
| email | user-attribute-ldap-mapper | `mail` → email |
| firstName | user-attribute-ldap-mapper | `givenName` → firstName |

Trade-off: LDAP Federation sync user trực tiếp vào realm, không tách identity source. Phù hợp khi muốn AD user hoàn toàn ngang hàng với local Keycloak user.

#### Cách 2: SAML/OIDC Identity Brokering (giữ tách biệt)

Cài **AD FS** (Active Directory Federation Services) trên Windows Server, expose SAML 2.0 endpoint. Keycloak broker qua AD FS — giống cách hiện tại với `acme-corp-realm` nhưng IdP thật.

| Component | Role |
|---|---|
| AD FS | SAML 2.0 IdP, authenticate against AD |
| Keycloak | SP (Service Provider), broker AD FS assertions |
| Mapper | NameID → username, AD group claim → Keycloak role |

Luồng: Browser → Keycloak → "Sign in with Acme Corp" → AD FS login page → AD authentication → SAML Response → Keycloak broker → create/link user.

Trade-off: phức tạp hơn (cần cài AD FS + cấu hình trust), nhưng giống production enterprise hơn và giữ user tách biệt giữa AD và Keycloak.

### 12.5 Môi trường chạy

**Đề xuất: VMware Workstation** (đã có trong PATH của máy dev)

| VM | OS | RAM | Disk | NIC |
|---|---|---|---|---|
| DC01 | Windows Server 2022 Eval | 4 GB | 60 GB | NAT hoặc Host-only |
| CLIENT01 (opt.) | Windows 10/11 Eval | 2 GB | 40 GB | cùng network |

Lý do chọn VMware:
- Snapshot trước/sau mỗi bước cấu hình → rollback dễ
- NAT networking cho phép VM ra Internet (download updates) + host truy cập VM
- Đã có sẵn trong `PATH` (`/c/Program Files (x86)/VMware/VMware Workstation`)

Alternative: Hyper-V (tích hợp Windows, performance tốt hơn) hoặc VirtualBox (miễn phí).

### 12.6 Kế hoạch triển khai step-by-step

#### Phase 1 — Dựng DC (1-2 giờ)

1. Tạo VM Windows Server 2022 Evaluation (180 ngày)
2. Set static IP `192.168.x.10`, hostname `DC01`
3. Install role: AD DS + DNS Server
4. `Install-ADDSForest -DomainName "acme.local"` (PowerShell)
5. Reboot → DC ready
6. Tạo OU structure + user demo + group bằng script PowerShell

Script mẫu (chạy trên DC01):

```powershell
# Tạo OU
New-ADOrganizationalUnit -Name "Employees" -Path "DC=acme,DC=local"
New-ADOrganizationalUnit -Name "Sellers" -Path "OU=Employees,DC=acme,DC=local"
New-ADOrganizationalUnit -Name "Warehouse" -Path "OU=Employees,DC=acme,DC=local"
New-ADOrganizationalUnit -Name "CS" -Path "OU=Employees,DC=acme,DC=local"
New-ADOrganizationalUnit -Name "Finance" -Path "OU=Employees,DC=acme,DC=local"

# Tạo group
New-ADGroup -Name "GG-Sellers" -GroupScope Global -Path "OU=Employees,DC=acme,DC=local"
New-ADGroup -Name "GG-Warehouse" -GroupScope Global -Path "OU=Employees,DC=acme,DC=local"

# Tạo user
New-ADUser -Name "John Doe" -SamAccountName "john.doe" `
  -UserPrincipalName "john.doe@acme.local" `
  -Path "OU=Sellers,OU=Employees,DC=acme,DC=local" `
  -AccountPassword (ConvertTo-SecureString "Acme@2024" -AsPlainText -Force) `
  -Enabled $true
Add-ADGroupMember -Identity "GG-Sellers" -Members "john.doe"

# Service account cho Keycloak LDAP bind
New-ADOrganizationalUnit -Name "ServiceAccounts" -Path "DC=acme,DC=local"
New-ADUser -Name "svc-keycloak" -SamAccountName "svc-keycloak" `
  -Path "OU=ServiceAccounts,DC=acme,DC=local" `
  -AccountPassword (ConvertTo-SecureString "Keycloak@Bind2024" -AsPlainText -Force) `
  -Enabled $true -PasswordNeverExpires $true
```

#### Phase 2 — Kết nối Keycloak (30 phút)

1. Đảm bảo host machine resolve được `DC01.acme.local` (sửa hosts file hoặc dùng DC DNS)
2. Keycloak Admin Console → ecommerce-realm → User Federation → Add LDAP
3. Điền config theo bảng 12.4
4. Test Connection → Test Authentication
5. Sync Users → kiểm tra user AD xuất hiện trong Keycloak
6. Thêm mapper: AD group → Keycloak role

#### Phase 3 — GPO demo (30 phút)

1. Group Policy Management → tạo GPO "Password Policy", "Account Lockout"
2. Link GPO vào `OU=Employees`
3. (Optional) Join CLIENT01 vào domain, `gpupdate /force`, test policy

#### Phase 4 — AD FS brokering (optional, 1 giờ)

1. Install role AD FS trên DC01
2. Configure AD FS → add Relying Party Trust cho Keycloak (SAML metadata URL)
3. Keycloak → Identity Providers → Add SAML → trỏ AD FS metadata
4. Test: login seller-workspace → "Sign in with Acme Corp" → AD FS → AD → broker về Keycloak

#### Phase 5 — Test & demo (30 phút)

1. Login john.doe từ AD vào seller-workspace → verify role seller
2. Login bob.warehouse → verify role staff-warehouse + group mapping
3. Đổi password trên AD → verify Keycloak nhận password mới (LDAP bind)
4. Disable user trên AD → verify Keycloak block login
5. Test GPO: account lockout sau 5 lần sai password
6. (Optional) Demo DHCP, DNS resolution, CA cert cho LDAPS

### 12.7 So sánh với hiện tại

| Tiêu chí | acme-corp-realm (hiện tại) | Windows AD (mới) |
|---|---|---|
| Identity source | Keycloak realm giả lập | Active Directory thật |
| Protocol | SAML mock | LDAP + optional AD FS SAML |
| User management | Keycloak Admin Console | AD Users & Computers / PowerShell |
| Password policy | Keycloak policy | Group Policy Object |
| MFA | Không | AD FS + Azure MFA hoặc Keycloak TOTP |
| Enterprise feel | Thấp | Cao — giống production |
| Setup effort | 5 phút (realm import) | 2-4 giờ (VM + AD + Keycloak config) |

### 12.8 Lưu ý

- Windows Server 2022 Evaluation: miễn phí 180 ngày, đủ cho demo.
- Nếu không muốn download ISO (~5 GB), có thể dùng Vagrant box `gusztavvargadr/windows-server-2022-standard`.
- Mạng: nên dùng **Host-only** network + NAT adapter (dual NIC) để DC vừa nói chuyện với host vừa ra Internet.
- Không cần thay thế hoàn toàn `acme-corp-realm`: có thể giữ mock realm cho CI/test nhanh, AD cho demo enterprise.

## 13. Hướng production

Những thay đổi nên làm nếu đưa ra môi trường thật:

- HTTPS và cookie `secure: true`.
- Backchannel logout thay cho frontchannel-only.
- Secrets manager thay `.env`.
- Drizzle migration versioned thay `db:push`.
- Nonce replay table cho payment URL.
- Step-up auth bằng ACR/AMR cho ShopPay.
- Integration test cho SSO, SLO, KYC, HMAC payment.
