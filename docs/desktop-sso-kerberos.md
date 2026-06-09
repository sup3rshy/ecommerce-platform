# Desktop SSO Kerberos/SPNEGO — Win10 domain login -> web login tự động

Runbook này nối tiếp [docs/active-directory.md](active-directory.md). Mục tiêu: user đăng nhập
máy Windows 10 bằng tài khoản domain `ECOMMERCE\...`, mở web bằng hostname LAN
`app.ecommerce.local`, Keycloak tự nhận diện qua Kerberos/SPNEGO và app nhận đúng role AD.

Điểm mấu chốt: **không dùng `localhost` từ Win10 VM**. Trên Win10, `localhost` là chính VM đó,
không phải máy thật đang chạy WSL/Docker.

## 0. Trạng thái hiện tại trong lab

- Domain: `ecommerce.local` / NetBIOS `ECOMMERCE`.
- DC: `DC01`, IP ví dụ `192.168.1.50`.
- Host Windows thật: IP Wi-Fi phải kiểm tra lại mỗi lần đổi mạng. Lần debug
  2026-06-05 đang là `192.168.1.148` (trước đó từng là `192.168.1.252`).
- Hostname web nội bộ: `app.ecommerce.local`.
- Keycloak LDAP provider live đã dùng:
  - Kerberos realm: `ECOMMERCE.LOCAL`
  - Server principal: `HTTP/app.ecommerce.local@ECOMMERCE.LOCAL`
  - KeyTab trong container: `/opt/keycloak/conf/keytabs/keycloak_app.keytab`

## 1. Tạo user AD theo từng role admin

Chạy trên **DC01 PowerShell as Administrator**. Script idempotent: user/group đã có thì bỏ qua.

```powershell
$domain = "DC=ecommerce,DC=local"
$adminPath = "OU=Admins,$domain"
$defaultPass = ConvertTo-SecureString "P@ssw0rd!2024" -AsPlainText -Force

function Ensure-AdminUser {
  param(
    [string]$Sam,
    [string]$Group,
    [string]$DisplayName
  )

  if (-not (Get-ADUser -Filter "SamAccountName -eq '$Sam'" -ErrorAction SilentlyContinue)) {
    New-ADUser -Name $DisplayName `
      -SamAccountName $Sam `
      -UserPrincipalName "$Sam@ecommerce.local" `
      -Path $adminPath `
      -AccountPassword $defaultPass `
      -Enabled $true `
      -EmailAddress "$Sam@ecommerce.local"
  }

  Add-ADGroupMember -Identity $Group -Members $Sam -ErrorAction SilentlyContinue
}

Ensure-AdminUser -Sam "ad-admin"     -Group "Platform-Admins"  -DisplayName "AD Platform Admin"
Ensure-AdminUser -Sam "ad-ecommerce" -Group "Ecommerce-Admins" -DisplayName "AD Ecommerce Admin"
Ensure-AdminUser -Sam "ad-food"      -Group "Food-Admins"      -DisplayName "AD Food Admin"
Ensure-AdminUser -Sam "ad-pay"       -Group "Pay-Admins"       -DisplayName "AD Pay Admin"

Get-ADGroupMember -Identity "Platform-Admins"  | Select-Object Name
Get-ADGroupMember -Identity "Ecommerce-Admins" | Select-Object Name
Get-ADGroupMember -Identity "Food-Admins"      | Select-Object Name
Get-ADGroupMember -Identity "Pay-Admins"       | Select-Object Name
```

Sau đó vào Keycloak LDAP provider và chạy lại **Synchronize all users** + **Sync LDAP Groups To
Keycloak** nếu user/group mới chưa xuất hiện.

## 2. DNS: trỏ app.ecommerce.local về máy thật

Lấy IP máy thật bằng `ipconfig` trên **Windows host thật**. Dùng IPv4 của card Wi-Fi/LAN đang
nối cùng mạng với DC và Win10 VM. Trong lần debug 2026-06-05 IP này là `192.168.1.148`, nhưng
nó có thể đổi sau khi đổi mạng.

Chạy trên **DC01 PowerShell as Administrator**:

```powershell
$zone = "ecommerce.local"
$name = "app"
$hostIp = "192.168.1.148" # đổi thành IP Wi-Fi hiện tại của máy thật

$old = Get-DnsServerResourceRecord -ZoneName $zone -Name $name -RRType A -ErrorAction SilentlyContinue
if ($old) {
  Remove-DnsServerResourceRecord -ZoneName $zone -InputObject $old -Force
}
Add-DnsServerResourceRecordA -ZoneName $zone -Name $name -IPv4Address $hostIp
```

Kiểm tra trên **Win10 VM**:

```powershell
ipconfig /flushdns
nslookup app.ecommerce.local
```

Kỳ vọng: trả về IP máy thật, không phải `127.0.0.1`.

Trên **máy thật Windows**, nếu không dùng DNS của DC cho chính máy thật, thêm hosts trỏ hostname
về IP LAN hiện tại của máy thật:

```text
192.168.1.148 app.ecommerce.local
```

File Windows: `C:\Windows\System32\drivers\etc\hosts` (mở Notepad as Administrator). Trong
**WSL**, nên giữ hostname này trỏ loopback để server-side code gọi Keycloak/app nội bộ trực tiếp:

```bash
getent hosts app.ecommerce.local
```

Nếu WSL chưa trả `127.0.0.1`, thêm vào `/etc/hosts` trong WSL:

```bash
echo '127.0.0.1 app.ecommerce.local' | sudo tee -a /etc/hosts
```

## 3. SPN + keytab cho Keycloak

Chạy trên **DC01 Command Prompt as Administrator**. Nếu `keycloak-krb` chưa có, tạo trước bằng
PowerShell:

```powershell
$saPath = "OU=ServiceAccounts,DC=ecommerce,DC=local"
$saPass = ConvertTo-SecureString "KrbPass@2024" -AsPlainText -Force
if (-not (Get-ADUser -Filter "SamAccountName -eq 'keycloak-krb'" -ErrorAction SilentlyContinue)) {
  New-ADUser -Name "keycloak-krb" -SamAccountName "keycloak-krb" `
    -UserPrincipalName "keycloak-krb@ecommerce.local" `
    -Path $saPath -AccountPassword $saPass -Enabled $true -PasswordNeverExpires $true
}
```

Xuất keytab:

```cmd
setspn -S HTTP/app.ecommerce.local keycloak-krb
ktpass /out C:\keycloak_app.keytab /princ HTTP/app.ecommerce.local@ECOMMERCE.LOCAL /mapuser keycloak-krb@ecommerce.local /pass KrbPass@2024 /crypto All /ptype KRB5_NT_PRINCIPAL /kvno 0
setspn -L keycloak-krb
```

Kỳ vọng có SPN `HTTP/app.ecommerce.local`.

Quan trọng: `C:\keycloak_app.keytab` ở đây nằm trong **VM Windows Server**, không phải ổ C của
máy thật. Hãy copy file này từ VM DC sang **Windows host thật**, đặt tại:

```text
C:\keycloak_app.keytab
```

## 4. Đưa keytab vào repo local và container

Chạy trong WSL tại root repo:

```bash
mkdir -p keycloak/keytabs
cp /mnt/c/keycloak_app.keytab keycloak/keytabs/keycloak_app.keytab
docker compose cp keycloak/keytabs/keycloak_app.keytab keycloak:/opt/keycloak/conf/keytabs/keycloak_app.keytab
```

`keycloak/keytabs/*.keytab` đã bị git ignore. Không commit file này.

Nếu IP DC khác `192.168.1.50`, sửa [keycloak/krb5.conf](../keycloak/krb5.conf) cho đúng `kdc`.
Sau đó recreate Keycloak để mount `krb5.conf` và thư mục keytab:

```bash
docker compose up -d --force-recreate keycloak
```

Lệnh này **không wipe volume**, nên không mất LDAP federation đã cấu hình.

## 5. Cập nhật app env và Keycloak realm live

Chạy trong WSL tại root repo:

```bash
bash scripts/use-local-domain.sh app.ecommerce.local
bash scripts/apply-keycloak-local-domain.sh app.ecommerce.local
```

Script thứ nhất đổi `.env` của từng app:

- `NEXTAUTH_URL=http://app.ecommerce.local:<port>`
- `KEYCLOAK_ISSUER=http://app.ecommerce.local:8080/realms/ecommerce-realm`
- `NEXT_PUBLIC_KEYCLOAK_ISSUER=...`

Script thứ hai cập nhật live Keycloak:

- thêm redirect URI/web origin `app.ecommerce.local` cho 5 client;
- chuyển frontchannel logout URL sang hostname LAN;
- bật `auth-spnego` trong browser flow và `shoppay-alternatives`;
- set LDAP Kerberos keytab path về `/opt/keycloak/conf/keytabs/keycloak_app.keytab`;
- đảm bảo `verifyEmail=false` trong lab không SMTP.

Restart dev runtime sau khi đổi env. Với lab Windows/VMware, dùng Docker app services để các port
`3000..3400` được Docker publish giống Keycloak `:8080`:

```bash
npm run dev:docker
```

`npm run dev:docker` sẽ dừng các Next dev process đang chạy trực tiếp trong WSL, chạy
`docker compose up -d`, rồi warmup route. Chế độ `npm run dev` vẫn còn để chạy thuần WSL, nhưng
không dùng cho Win10 VM vì Windows host đã timeout với các process Next chạy trực tiếp trong WSL.
Trong Docker mode, compose ép các app chạy `next dev --webpack`; không bỏ flag này. Turbopack đã
panic trong bind-mount Docker mode trên lab này và làm Admin Portal mất client interaction/reload.
Các `next.config.ts` cũng cần giữ `allowedDevOrigins: ["app.ecommerce.local"]`; nếu bỏ, browser sẽ
báo lỗi `/_next/webpack-hmr` WebSocket và log container có `Blocked cross-origin request to Next.js
dev resource` khi mở app bằng hostname Kerberos.

Trong Docker network, `app.ecommerce.local` là network alias của service Keycloak. Nhờ vậy app
container vẫn dùng issuer `http://app.ecommerce.local:8080/realms/ecommerce-realm` giống browser,
nhưng server-side OIDC không phải đi vòng ra Windows host.

## 6. Mở port từ Win10 VM vào WSL

Chạy trên **Windows host thật, PowerShell as Administrator**. Không chạy trong Win10 VM.

Cách khuyến nghị: dùng script repo. Script này xoá portproxy cũ cho các port dev, tự chọn IP LAN
chính của Windows làm listen address, forward tới IP WSL hiện tại, mở Windows/Hyper-V firewall,
rồi kiểm tra cả TCP lẫn HTTP. Sau khi chạy `npm run dev:docker`, các port `3000..3400/8000/8080`
đều là Docker-published ports, nên Windows host phải HTTP được như `:8080`. Script cũng kiểm tra
HTTP bằng hostname Kerberos
`app.ecommerce.local` với `curl --resolve app.ecommerce.local:<port>:<listen-ip>` để chắc rằng
web mở được bằng đúng hostname dùng cho SPNEGO, không chỉ bằng IP.

Trong lab này, không dùng `listenaddress=0.0.0.0`; dùng listen address là IP LAN cụ thể của
Windows host (ví dụ `192.168.1.148`) và connect address là IP WSL hiện tại. `connectaddress=127.0.0.1`
từng pass TCP nhưng HTTP reset trên máy này, nên mặc định script dùng `connectaddress=<WSL-IP>`.

```powershell
powershell -ExecutionPolicy Bypass -File "\\wsl$\Ubuntu\home\odixe\ecommerce-platform\scripts\windows-host-portproxy.ps1"
```

Nếu các mục `HTTP checks from Windows host directly to portproxy backend` vẫn fail cho WSL IP, thử
nới Hyper-V firewall inbound cho WSL rồi script sẽ tạo lại portproxy:

```powershell
powershell -ExecutionPolicy Bypass -File "\\wsl$\Ubuntu\home\odixe\ecommerce-platform\scripts\windows-host-portproxy.ps1" -AllowAllWslInbound
```

Nếu máy Windows thật không dùng DNS của DC và không resolve được `app.ecommerce.local`, có thể để
script cập nhật luôn hosts file của máy thật:

```powershell
powershell -ExecutionPolicy Bypass -File "\\wsl$\Ubuntu\home\odixe\ecommerce-platform\scripts\windows-host-portproxy.ps1" -UpdateHostsFile
```

Nếu Windows không cho ghi hosts file, script chỉ in warning rồi tiếp tục chạy portproxy/checks. Khi
đó cập nhật thủ công `C:\Windows\System32\drivers\etc\hosts` bằng Notepad as Administrator, hoặc
dùng DNS A record trên DC cho `app.ecommerce.local`.

Nếu tên distro không phải `Ubuntu`, mở `\\wsl$` trong File Explorer để xem tên đúng. Sau khi chạy,
script sẽ in:

- bảng `portproxy`;
- các IPv4 hiện tại của Windows host, dùng để cập nhật DNS A record trên DC;
- DNS/hosts resolution của `app.ecommerce.local` trên Windows host thật;
- HTTP check trực tiếp từ Windows host tới backend WSL IP;
- TCP check từ Windows host tới WSL IP;
- TCP check qua địa chỉ portproxy.
- HTTP check qua địa chỉ portproxy.
- HTTP check bằng hostname Kerberos, ép resolve về địa chỉ portproxy.

Kỳ vọng quan trọng nhất:

- **HTTP checks from Windows host directly to portproxy backend** OK cho WSL IP.
- **HTTP checks through portproxy listen address** OK cho `3000,3100,3200,3300,3400,8000,8080`.
- **HTTP checks with Kerberos hostname forced to portproxy listen address** cũng OK cho các port đó.

Mục TCP tới WSL IP là chẩn đoán nhanh, nhưng HTTP backend mới là tín hiệu quyết định. Nếu TCP qua
listen address OK mà HTTP qua listen address reset, portproxy đang accept kết nối nhưng chưa nối
được tới backend WSL.

Lệnh thủ công tương đương, chỉ dùng khi cần debug:

```powershell
$listenAddress = "192.168.1.148" # đổi thành IP Wi-Fi/LAN hiện tại của máy thật
$connectAddress = "172.26.212.202" # đổi thành IP WSL hiện tại, xem dòng "Using WSL IP" của script
$ports = @(3000, 3100, 3200, 3300, 3400, 8000, 8080)
$portStrings = $ports | ForEach-Object { [string]$_ }
# WSL VMCreatorId cố định theo Microsoft Learn Hyper-V Firewall docs.
$wslVmCreatorId = "{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}"

foreach ($port in $ports) {
  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port
  netsh interface portproxy delete v4tov4 listenaddress=$listenAddress listenport=$port
  netsh interface portproxy add v4tov4 listenaddress=$listenAddress listenport=$port connectaddress=$connectAddress connectport=$port
}

New-NetFirewallRule -DisplayName "Ecommerce Platform WSL dev ports" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $ports
Remove-NetFirewallHyperVRule -Name "EcommercePlatformWslDevPorts" -ErrorAction SilentlyContinue
New-NetFirewallHyperVRule -Name "EcommercePlatformWslDevPorts" -DisplayName "Ecommerce Platform WSL dev ports" -Direction Inbound -VMCreatorId $wslVmCreatorId -Protocol TCP -LocalPorts $portStrings -Action Allow
netsh interface portproxy show v4tov4
```

Không dùng `connectaddress=127.0.0.1` làm mặc định trên máy này: log ngày 2026-06-05 cho thấy TCP
qua portproxy OK nhưng HTTP reset. Dùng listen address là IP LAN cụ thể như script đang làm, và
connect address là IP WSL hiện tại. Sau mỗi lần đổi mạng/Wi-Fi IP hoặc WSL restart, hãy chạy lại
script này và cập nhật DNS A record.

Với cấu hình này, DC DNS A record `app.ecommerce.local` nên trỏ tới `$listenAddress`, ví dụ
`192.168.1.148`. Không trỏ Win10 VM tới `127.0.0.1`.

`Nginx :8000` chạy trong Docker bridge network và publish `8000:8000`; upstream trỏ tới service
name (`shop-ecommerce-app`, `shop-sell-app`, `shop-food-app`, `admin-portal-app`, `keycloak`).

## 7. Cấu hình trình duyệt Win10 gửi Negotiate

Trên **Win10 VM** đang đăng nhập domain:

1. Mở **Internet Options**.
2. Tab **Security** -> **Local intranet** -> **Sites** -> **Advanced**.
3. Add:

```text
http://app.ecommerce.local
```

Nếu dùng Chrome/Edge mà vẫn không gửi Kerberos, thêm policy cho user hiện tại:

```powershell
reg add "HKCU\Software\Policies\Google\Chrome" /v AuthServerAllowlist /t REG_SZ /d "app.ecommerce.local" /f
reg add "HKCU\Software\Policies\Microsoft\Edge" /v AuthServerAllowlist /t REG_SZ /d "app.ecommerce.local" /f
```

Đóng mở lại trình duyệt sau khi thêm policy.

## 8. Checklist kiểm tra theo thứ tự

Trên **Win10 VM**:

```powershell
whoami
klist purge
nltest /dsgetdc:ecommerce.local
nslookup app.ecommerce.local
Test-NetConnection app.ecommerce.local -Port 8080
Test-NetConnection app.ecommerce.local -Port 3400
```

Nếu port `8080/3400` fail: sửa DNS A record hoặc chạy lại
`scripts/windows-host-portproxy.ps1` trên máy thật. Nếu `nslookup app.ecommerce.local` trả về IP
cũ của máy thật, cập nhật lại A record trên DC rồi `ipconfig /flushdns` trong Win10 VM.

Mở đúng URL:

```text
http://app.ecommerce.local:3400
```

Không dùng `localhost:3400` cho Desktop SSO/admin auth vì cookie, callback URL và SPN đều theo
`app.ecommerce.local`. Admin Portal hiện redirect loopback sang host canonical để tránh reload loop,
nhưng URL cần kiểm thử vẫn là `http://app.ecommerce.local:3400`.

Các app dùng route trung gian `/auth/sso` để tự khởi tạo NextAuth `signIn("keycloak")`. Vì vậy
route cần đăng nhập sẽ đi theo chuỗi app -> `/auth/sso` -> Keycloak authorize; người dùng không
phải bấm trang NextAuth mặc định hoặc nút `Sign in with Keycloak`. Nếu thấy trang provider mặc
định của NextAuth, kiểm tra còn link/redirect nào trỏ tới `/api/auth/signin` thay vì `/auth/sso`.

Nếu browser hiện popup native kiểu `Sign in http://app.ecommerce.local:8080` trước form Keycloak,
đó là Kerberos/SPNEGO challenge từ Keycloak (`WWW-Authenticate: Negotiate`), không phải UI của app.
Popup này xuất hiện khi browser không tự gửi được Kerberos ticket. Thường gặp khi mở từ máy thật
chưa join domain, Win10 chưa login domain, hostname chưa nằm trong Local intranet/Chrome/Edge
allowlist, hoặc DNS/SPN/keytab/time lệch. Có thể bấm Cancel để fallback về form Keycloak manual;
muốn bỏ hẳn popup thì disable `auth-spnego` trong browser flow, nhưng khi đó Desktop SSO tự động
sẽ không còn.

Sau khi truy cập, kiểm tra vé Kerberos trên Win10:

```powershell
klist
```

Kỳ vọng có vé service `HTTP/app.ecommerce.local`.

Trên WSL xem log Keycloak:

```bash
docker compose logs -f keycloak | grep -iE 'spnego|kerberos|gss|keytab'
```

Nếu app mở được nhưng vẫn hiện form login Keycloak:

- Win10 chưa gửi Negotiate: kiểm tra Local intranet / Chrome Edge policy.
- SPN sai hostname: `setspn -L keycloak-krb` phải có `HTTP/app.ecommerce.local`.
- Keytab cũ so với SPN/password: chạy lại `ktpass`, copy keytab, `docker compose cp`, rồi restart Keycloak.
- Lệch giờ DC/Win10/host quá 5 phút: sync time.
- Keycloak LDAP provider chưa bật Kerberos integration hoặc keytab path sai.

Nếu đăng nhập vào Admin Portal nhưng bị `/denied`: user AD đã vào được nhưng group->role mapper
chưa map đúng. Sync LDAP groups và kiểm tra role mapping của `Platform-Admins`/`Ecommerce-Admins`/
`Food-Admins`/`Pay-Admins`.
