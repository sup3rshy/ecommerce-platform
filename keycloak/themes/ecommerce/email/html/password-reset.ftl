<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dat lai mat khau</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe4f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#172554;color:#ffffff;padding:22px 28px;">
                <div style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">Ecommerce Platform</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">Yêu cầu đặt lại mật khẩu</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Xin chào <strong>${user.firstName!user.username}</strong>,</p>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">
                  Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>${realmName}</strong> của bạn. Nếu đúng là bạn, hãy dùng nút bên dưới để tạo mật khẩu mới.
                </p>
                <p style="margin:28px 0;text-align:center;">
                  <a href="${link}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:8px;">Đặt lại mật khẩu</a>
                </p>
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#475569;">
                  Liên kết này hết hạn sau <strong>${linkExpirationFormatter(linkExpiration)}</strong>. Nếu nút phía trên không hoạt động, hãy sao chép liên kết sau vào trình duyệt:
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all;color:#1d4ed8;">${link}</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
                  Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại của bạn sẽ không thay đổi.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">
                Email này được gửi tự động từ Ecommerce Platform. Vui lòng không trả lời trực tiếp email này.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
