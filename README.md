# ArcBot — USDC Telegram Wallet

Telegram bot cho phép gửi/nhận USDC trên Arc Network ngay trong chat.

## Commands

| Command | Mô tả |
|---------|-------|
| `/start` | Tạo ví + xem số dư |
| `/balance` | Xem số dư USDC |
| `/deposit` | Xem địa chỉ nạp |
| `/send @user 50` | Gửi USDC cho người dùng Telegram |
| `/send 0xabc... 50` | Gửi USDC ra ví ngoài |
| `/history` | 5 giao dịch gần nhất |

## Giới hạn

- 100 USDC/lần
- 300 USDC/ngày
- 5 giao dịch/giờ

## Cài đặt

```bash
npm install
# Tạo bot trên @BotFather, lấy token
# Sửa BOT_TOKEN trong .env
npm start
```

## Deploy với pm2

```bash
pm2 start bot.js --name arcbot
pm2 save
pm2 startup
```
