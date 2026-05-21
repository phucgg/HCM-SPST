# Deploy public cho web quiz HCM

## Cách khuyên dùng: Railway + Volume

Cách này cho người khác vào được bằng link public, backend chạy thật, realtime Socket.IO chạy thật, database SQLite được lưu trên volume nên không mất điểm khi restart/deploy.

### 1. Test local trước

```bash
npm run install:all
npm run build
npm start
```

Mở: http://localhost:3000

### 2. Đẩy code lên GitHub

```bash
git init
git add .
git commit -m "hcm realtime quiz"
```

Tạo repository trên GitHub, rồi chạy lệnh GitHub đưa cho bạn, thường là:

```bash
git remote add origin https://github.com/USERNAME/hcm-web-quiz.git
git branch -M main
git push -u origin main
```

### 3. Deploy lên Railway

1. Vào Railway.
2. New Project.
3. Deploy from GitHub repo.
4. Chọn repo `hcm-web-quiz`.
5. Railway sẽ đọc Dockerfile và build app.

### 4. Gắn Volume để lưu database

Trong service Railway:

1. Vào tab Volumes.
2. Add Volume.
3. Mount path: `/data`.
4. Vào Variables thêm:

```txt
NODE_ENV=production
DB_PATH=/data/app.db
```

`PORT` không cần tự set nếu Railway tự cấp. Code đã đọc `process.env.PORT`.

### 5. Lấy link public

Vào Settings hoặc Networking/Deployments của service, tạo Public Domain. Sau đó bạn sẽ có link kiểu:

```txt
https://ten-app.up.railway.app
```

Gửi link đó cho người khác. Khi nhiều người mở cùng lúc, bảng xếp hạng sẽ cập nhật realtime không cần refresh.

## Lưu ý chống bị bắt bẻ

- Câu hỏi nằm trong `server/questions.js`.
- Đáp án đúng chỉ nằm ở server, frontend không biết đáp án trước.
- App không dùng Google Analytics, không dùng Facebook Pixel, không dùng cookie.
- App chỉ lưu nickname, điểm, tổng câu, thời gian làm bài, thời điểm nộp.
- Hosting provider vẫn có thể có log hạ tầng riêng; app của mình không chủ động tracking người dùng.
