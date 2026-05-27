# ArcWhale — Whale Alert Bot

Telegram bot theo dõi giao dịch USDC lớn trên Arc Network.

## Tính năng

- Quét block Arc mỗi 10s
- Phát hiện giao dịch > 5000 USDC
- Phân loại: 🐋 Large (5K+), 🐳 Whale (100K+)
- Gửi alert trực tiếp vào Telegram chat

## Commands

| Command | Mô tả |
|---------|-------|
| `/start` | Giới thiệu |
| `/sub` | Đăng ký whale alert |
| `/unsub` | Hủy whale alert |
| `/status` | Xem trạng thái |

## Cài đặt

```bash
npm install
# Sửa BOT_TOKEN trong .env (lấy từ @BotFather)
npm start
pm2 start monitor.js --name arcwhale
```

## Deploy

```bash
pm2 start bot.js --name arcbot
pm2 start monitor.js --name arcwhale
pm2 save
```
