# Knowledge Graph Entity Resolution
## Distributed Data De-duplication for Scientific Papers

---

## Cấu trúc project

```
knowledge-graph-dedup/
├── data-pipeline/
│   ├── generate_dataset.py     ← Tạo dataset 5400 papers
│   ├── requirements.txt
│   └── output/                 ← Sau khi chạy script
│       ├── site_a.db           (2700 papers - DBLP)
│       ├── site_b.db           (2700 papers - Semantic Scholar)
│       └── ground_truth.json   (800 duplicate pairs)
│
├── backend/
│   ├── requirements.txt
│   ├── site-a/
│   │   ├── main.py             ← FastAPI (port 8001)
│   │   └── Dockerfile
│   ├── site-b/
│   │   ├── main.py             ← FastAPI (port 8002)
│   │   └── Dockerfile
│   └── coordinator/
│       ├── main.py             ← Entity resolution engine (port 8000)
│       └── Dockerfile
│
├── frontend/
│   ├── src/App.jsx             ← React dashboard
│   ├── package.json
│   ├── vite.config.js
│   ├── Dockerfile
│   └── nginx.conf
│
└── docker-compose.yml          ← Chạy tất cả bằng 1 lệnh
```

---

## BƯỚC 1 — Tạo Dataset

```bash
cd data-pipeline
pip install -r requirements.txt
python generate_dataset.py
```

Output:
- `output/site_a.db` — 2700 papers từ DBLP
- `output/site_b.db` — 2700 papers từ Semantic Scholar (800 papers trùng với site A, tên biến thể)
- `output/ground_truth.json` — 800 cặp duplicate thật (dùng tính F1)

---

## BƯỚC 2 — Chạy toàn bộ hệ thống với Docker

```bash
# Từ thư mục gốc
docker compose up --build
```

Sau khi build xong (~3–5 phút lần đầu):

| Service | URL | Mô tả |
|---|---|---|
| Frontend | http://localhost:3000 | Dashboard React |
| Coordinator | http://localhost:8000 | API engine |
| Site A (DBLP) | http://localhost:8001 | Data node A |
| Site B (Semantic Scholar) | http://localhost:8002 | Data node B |

---

## BƯỚC 3 — Sử dụng Dashboard

1. Mở http://localhost:3000
2. Kiểm tra 3 status dot trên header đều **ONLINE** (xanh)
3. Bấm **▶ START RESOLUTION**
4. Chuyển sang tab **Resolution** để xem log real-time
5. Sau khi xong → tab **Results** và **Metrics** để xem kết quả

---

## DEMO FAILURE CASE (Quan trọng cho chấm điểm)

### Giảng viên tắt Site B:

```bash
# Terminal 2 — trong khi resolution đang chạy
docker stop kg_site_b
```

Hệ thống sẽ:
1. Coordinator nhận timeout error HTTP thật
2. Log hiện: "Site B unreachable"
3. Queue jobs của year đang xử lý vào `pending_queue.json`
4. Tiếp tục với các year khác (partial mode)

### Khôi phục:

```bash
docker start kg_site_b
```

Hệ thống sẽ:
1. Phát hiện Site B online trở lại
2. Retry các jobs trong queue
3. Tiếp tục resolution bình thường

---

## API Endpoints

### Coordinator (port 8000)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Kiểm tra coordinator |
| GET | `/sites/status` | Trạng thái cả 3 sites |
| POST | `/resolution/start` | Bắt đầu resolution job |
| GET | `/resolution/status` | Trạng thái job + log |
| GET | `/resolution/results` | Kết quả phân loại |
| GET | `/resolution/stats` | Thống kê + topology |
| GET | `/metrics/f1` | Precision / Recall / F1 |
| GET | `/queue` | Xem pending queue |

### Site A & B (port 8001/8002)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Kiểm tra site |
| GET | `/papers?page=1&size=50` | Danh sách papers |
| GET | `/papers/{id}` | Chi tiết 1 paper |
| GET | `/authors` | Danh sách authors |
| GET | `/candidates?year=2021` | Papers theo blocking key |
| GET | `/stats` | Thống kê site |

---

## Thuật toán Similarity

```
score = 0.40 × title_similarity
      + 0.25 × author_similarity
      + 0.20 × venue_similarity
      + 0.15 × year_similarity

Nếu DOI trùng → boost score đáng kể (strong signal)

Ngưỡng quyết định:
  ≥ 0.82  →  MERGE    (gộp node)
  ≥ 0.62  →  REVIEW   (cần xem lại thủ công)
  < 0.62  →  SEPARATE (2 entity khác nhau)
```

---

## Liên hệ Lý thuyết Özsu & Valduriez

| Concept | Chương | Ứng dụng trong project |
|---|---|---|
| Horizontal Fragmentation | Ch. 4 | Site A = DBLP fragment, Site B = SemanticScholar fragment |
| Schema Heterogeneity | Ch. 3 | name vs full_name, venue vs venue+year |
| Wrapper/Mediator | Ch. 3 | Coordinator = Mediator, Site APIs = Wrappers |
| Semi-join Optimization | Ch. 6 | Blocking: chỉ gửi candidate keys, không gửi full record |
| Eventual Consistency | Ch. 8 | SAME_AS edges propagate async sau khi merge |
| Edge-Cut Ratio | Ch. 4 | Đo % cross-site edges sau resolution |

---

## Chạy không dùng Docker (local dev)

```bash
# Terminal 1 — Site A
cd backend/site-a
pip install -r ../requirements.txt
DB_PATH=../../data-pipeline/output/site_a.db uvicorn main:app --port 8001

# Terminal 2 — Site B
cd backend/site-b
DB_PATH=../../data-pipeline/output/site_b.db uvicorn main:app --port 8002

# Terminal 3 — Coordinator
cd backend/coordinator
mkdir -p data
cp ../../data-pipeline/output/ground_truth.json data/
uvicorn main:app --port 8000

# Terminal 4 — Frontend
cd frontend
npm install
npm run dev
```

---

## Metrics mục tiêu

| Metric | Target | Ý nghĩa |
|---|---|---|
| Precision | > 0.88 | Ít false merge |
| Recall | > 0.80 | Tìm được nhiều duplicate thật |
| F1 Score | > 0.84 | Cân bằng precision/recall |
| Edge-Cut Ratio | > 0.25 | Nhiều cross-site links |
| Throughput | > 200 pairs/s | Hiệu suất xử lý |
