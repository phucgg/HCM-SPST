# HCM Quiz Realtime

Web quiz nhỏ về tư tưởng Hồ Chí Minh: độc lập dân tộc gắn liền với chủ nghĩa xã hội.

## Có gì?

- React + Vite frontend
- Node.js + Express backend
- SQLite database
- Server-side answer checking: client không có đáp án đúng
- Realtime leaderboard bằng Socket.IO, không cần refresh
- Không tracking: không analytics, không cookie, app không lưu IP/User-Agent
- Bảo vệ cơ bản: Helmet, rate limit, Zod validation, SQLite prepared statements

## Chạy local

```bash
npm run install:all
cp .env.example .env
npm run dev
```

Mở frontend: http://localhost:5173
Backend: http://localhost:3000

## Chạy production

```bash
npm run install:all
npm run build
npm start
```

Mở: http://localhost:3000

## DB

File DB mặc định: `server/app.db`
Bảng chính: `attempts`

DB chỉ lưu:
- nickname
- score
- total
- duration_ms
- created_at

Không lưu IP, không lưu user-agent, không dùng cookie, không gắn Google Analytics/Facebook Pixel.

## Nội dung kiến thức

Câu hỏi được seed trong `server/questions.js`. Muốn sửa kiến thức thì sửa file này.
Đáp án đúng chỉ nằm ở server, không gửi xuống frontend trước khi nộp.
