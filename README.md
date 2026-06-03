# Knowledge Graph Entity Resolution & 3D Visualization
## Distributed Data De-duplication for Scientific Papers

**Entity Resolution Engine** — Hệ thống hợp nhất thực thể trên Đồ thị Tri thức phân tán cho bài toán khử trùng lặp (De-duplication) các bài báo khoa học giữa hai nguồn dữ liệu: **DBLP** và **Semantic Scholar**.

Hệ thống sử dụng kiến trúc **Mediator/Wrapper** (theo mô hình Özsu & Valduriez - Distributed Database Systems), tích hợp 3 mô hình dữ liệu (Relational, Graph, Document) và hỗ trợ trực quan hóa 3D tương tác cao.

---

## 📋 Mục lục

- [Tổng quan hệ thống](#-tổng-quan-hệ-thống)
- [Kiến trúc](#-kiến-trúc)
- [Yêu cầu](#-yêu-cầu)
- [Cách 1: Chạy với Docker (Khuyên dùng)](#-cách-1-chạy-với-docker-khuyên-dùng)
- [Cách 2: Chạy không Docker (Python trực tiếp)](#-cách-2-chạy-không-docker-python-trực-tiếp)
- [Sau khi chạy — Hướng dẫn sử dụng](#-sau-khi-chạy--hướng-dẫn-sử-dụng)
- [Tính năng giao diện](#-tính-năng-giao-diện)
- [API Endpoints](#-api-endpoints)
- [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
- [Demo Failure Handling](#-demo-failure-handling)
- [Công nghệ sử dụng](#-công-nghệ-sử-dụng)

---

## 🚀 Quy trình nhanh từ Clone → Chạy được (7 bước)

> Dành cho người mới clone project lần đầu — làm theo thứ tự từ trên xuống.

| # | Bước | Lệnh / Thao tác | Thời gian |
|---|---|---|---|
| **1** | **Tạo 3 Supabase Projects** | Vào [supabase.com](https://supabase.com) → New Project × 3 → chạy schema SQL | 10 phút |
| **2** | **Tạo file `.env`** | Copy connection string vào `.env` (xem hướng dẫn bên dưới) | 2 phút |
| **3** | **Sinh dữ liệu mẫu** | `cd data-pipeline && pip install -r requirements.txt && python generate_dataset.py` | 2 phút |
| **4** | **Upload dữ liệu lên Supabase** | `python migrate_to_supabase.py` *(vẫn ở `data-pipeline/`)* | 5 phút |
| **5** | **Chạy Docker** | `cd .. && docker compose up --build -d` | 5 phút |
| **6** | **Chạy Entity Resolution** | Vào http://localhost:3000 → Resolution → START RESOLUTION | 30 giây |
| **7** | **Xem kết quả** | Dashboard: http://localhost:3000 — API: http://localhost:8000/docs | — |

> ⚠️ Chi tiết từng bước có trong các phần bên dưới. Nếu không dùng Docker được, xem **Cách 2: Chạy không Docker**.

---

## 🎯 Tổng quan hệ thống

Hệ thống giải quyết bài toán **Entity Resolution** (Record Linkage) cho dữ liệu khoa học phân tán:

| Thành phần | Mô tả |
|---|---|
| **Site A** | Mô phỏng DBLP — 5,000 bài báo khoa học |
| **Site B** | Mô phỏng Semantic Scholar — 5,000 bài báo khoa học |
| **Coordinator** | Trung tâm điều phối, tính toán similarity, quyết định MERGE/REVIEW/SEPARATE |
| **Frontend** | Dashboard React với 3D Graph Visualization |

**Quy trình xử lý:**
1. Coordinator nhận yêu cầu → gọi song song cả 2 Site lấy danh sách ứng viên
2. Áp dụng **Blocking** (nhóm theo ký tự đầu tiêu đề) để giảm số cặp so sánh
3. Tính **Similarity Score** (Levenshtein, Token Sort, DOI match, Year/Venue/Author)
4. Phân loại: **MERGE** (≥ 0.82), **REVIEW** (≥ 0.62), **SEPARATE** (< 0.62)
5. Xây dựng **Knowledge Graph** với các `SAME_AS` links
6. Phân tích **Topology** (Edge-Cut, Connected Components)

---

## 🏗 Kiến trúc

```
┌──────────────┐     ┌──────────────────────────────────┐     ┌──────────────┐
│   Frontend   │     │          Coordinator              │     │   Supabase   │
│  (React 3D)  │◄───►│  - Entity Resolution Engine      │◄───►│  - Project 1 │
│  :3000       │     │  - Similarity Computation         │     │    (Site A)  │
└──────────────┘     │  - Graph Building & Topology     │     │  - Project 2 │
                     │  - BFS/DFS/Shortest Path          │     │    (Site B)  │
                     │  - Multi-Model Integration        │     │  - Project 3 │
                     │  - Failure Recovery (Queue)       │     │  (Coordinator)│
                     └───────┬────────────┬──────────────┘     └──────────────┘
                             │            │
                    ┌────────▼──┐  ┌──────▼────────┐
                    │  Site A   │  │   Site B      │
                    │  (DBLP)   │  │ (S. Scholar)  │
                    │  :8001    │  │  :8002        │
                    └───────────┘  └───────────────┘
```

- **Mediator/Wrapper**: Coordinator là Mediator, Site A/B là Wrapper
- **3 Database độc lập**: Mỗi service có Supabase Project riêng biệt
- **Giao tiếp HTTP**: Coordinator gọi REST API đến các Site

---

## 📦 Yêu cầu

| Cách chạy | Yêu cầu |
|---|---|
| **Docker** | Docker Desktop (hoặc Docker Engine) |
| **Python trực tiếp** | Python 3.12+, Node.js 18+, npm |
| **Cả 2 cách** | 3 Supabase Projects (hướng dẫn bên dưới) |

### Chuẩn bị Supabase Projects

Hệ thống cần **3 Supabase Projects riêng biệt** (1 cho mỗi service):

1. Vào [supabase.com](https://supabase.com) → **New Project**
2. Tạo **Project 1** (Site A - DBLP), **Project 2** (Site B - Semantic Scholar), **Project 3** (Coordinator)
3. Với mỗi project, vào **SQL Editor** → chạy file schema tương ứng:
   - Project 1: `supabase/schema_site_a.sql`
   - Project 2: `supabase/schema_site_b.sql`
   - Project 3: `supabase/schema_coordinator.sql`
4. Vào `Project Settings → Database → Connection string (URI)` → copy URI

### Tạo file .env

Tạo file `.env` ở thư mục gốc project với nội dung:

```env
# Supabase Project 1 - Site A (DBLP)
DATABASE_URL_SITE_A=postgresql://postgres:PASSWORD@db.PROJECT1.supabase.co:5432/postgres

# Supabase Project 2 - Site B (Semantic Scholar)
DATABASE_URL_SITE_B=postgresql://postgres:PASSWORD@db.PROJECT2.supabase.co:5432/postgres

# Supabase Project 3 - Coordinator (Merge & Job Results)
DATABASE_URL_COORDINATOR=postgresql://postgres:PASSWORD@db.PROJECT3.supabase.co:5432/postgres
```

> **Lưu ý**: Có thể dùng Connection Pooler (port 6543) thay vì port 5432.

### Tạo dữ liệu mẫu (SQLite)

```bash
cd data-pipeline
pip install -r requirements.txt
python generate_dataset.py
```

Kết quả: tạo `output/site_a.db` (5,000 papers), `output/site_b.db` (5,000 papers) và `output/ground_truth.json` (1,000 cặp trùng lặp).

### Upload dữ liệu lên Supabase

```bash
python migrate_to_supabase.py
```

Script sẽ:
- Tạo bảng và indexes trên cả 3 Supabase Projects
- Upload **1,500 authors**, **5,000 papers**, **15,000+ paper_authors** cho mỗi Site
- Khởi tạo Coordinator database
- Upload **1,000 cặp ground truth**

---

## 🐳 Cách 1: Chạy với Docker (Khuyên dùng)

Cách đơn giản nhất — Docker sẽ build và chạy tất cả services tự động.

### Bước 1: Build & Start

```bash
# Từ thư mục gốc project (có file docker-compose.yml và .env)
docker compose up --build -d
```

Lệnh này sẽ build 4 Docker images và start 4 containers:

```
kg_site_a       → http://localhost:8001
kg_site_b       → http://localhost:8002
kg_coordinator  → http://localhost:8000
kg_frontend     → http://localhost:3000
```

### Bước 2: Kiểm tra health

```bash
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8000/health
# Kỳ vọng: {"status": "online"}
```

### Bước 3: Truy cập Dashboard

Mở trình duyệt: **[http://localhost:3000](http://localhost:3000)**

### Lệnh Docker hữu ích

```bash
# Xem logs
docker compose logs -f

# Xem log một service
docker logs kg_coordinator -f

# Dừng tất cả
docker compose down

# Chạy lại
docker compose up -d

# Build lại (khi có thay đổi code)
docker compose up --build -d
```

---

## 🔧 Cách 2: Chạy không Docker (Python trực tiếp)

Sử dụng khi không có Docker, hoặc muốn debug từng service riêng lẻ.

### Bước 1: Cài đặt Python dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt

# Data pipeline (nếu chưa cài)
cd ../data-pipeline
pip install -r requirements.txt
```

### Bước 2: Cài đặt Frontend dependencies

```bash
cd frontend
npm install
```

### Bước 3: Khởi động Backend Services

**Cách thủ công (mở 3 terminal riêng):**

Terminal 1 — Site A:
```bash
cd backend/site-a
# Windows (PowerShell):
#   $env:DATABASE_URL="postgresql://postgres:...@..."
# Linux/Mac:
#   export DATABASE_URL="postgresql://postgres:...@..."
python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

Terminal 2 — Site B:
```bash
cd backend/site-b
# Set DATABASE_URL từ .env (DATABASE_URL_SITE_B)
python -m uvicorn main:app --host 0.0.0.0 --port 8002
```

Terminal 3 — Coordinator:
```bash
cd backend/coordinator
# Set DATABASE_URL từ .env (DATABASE_URL_COORDINATOR)
export SITE_A_URL=http://localhost:8001
export SITE_B_URL=http://localhost:8002
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

> **Mẹo**: Dùng [dotenv-run](https://pypi.org/project/python-dotenv/) để load tự động:
> ```bash
> pip install python-dotenv
> cd backend/site-a
> dotenv run --file ../../.env --override DATABASE_URL=DATABASE_URL_SITE_A -- python -m uvicorn main:app --port 8001
> ```

### Bước 4: Khởi động Frontend

```bash
# Terminal 4
cd frontend
npm run dev
```

Frontend sẽ chạy ở **http://localhost:3000**

---

## 🚀 Sau khi chạy — Hướng dẫn sử dụng

### 1. Chạy Entity Resolution

**Cách 1 — Dùng Dashboard:**
Vào http://localhost:3000 → Tab **Resolution** → Click **▶ START RESOLUTION**

**Cách 2 — Dùng API:**
```bash
curl -X POST http://localhost:8000/resolution/start \
  -H "Content-Type: application/json" \
  -d '{"years": [2018, 2019, 2020, 2021, 2022, 2023], "limit_per_year": 80}'
```

### 2. Theo dõi tiến trình

```bash
# Xem trạng thái real-time
curl http://localhost:8000/resolution/status

# Xem thống kê
curl http://localhost:8000/resolution/stats

# Xem kết quả F1 Score
curl http://localhost:8000/metrics/f1
```

### 3. API Docs (Swagger)

Mở trình duyệt: **[http://localhost:8000/docs](http://localhost:8000/docs)**

### 4. Khám phá Dashboard

Truy cập http://localhost:3000 và khám phá các tab:
- **Dashboard** — Tổng quan stats, top merges, pending queue
- **Resolution** — Log thời gian thực, site status
- **Results** — Danh sách kết quả MERGE/REVIEW/SEPARATE
- **Metrics** — Precision/Recall/F1, Topology Analysis
- **Graph Explorer** — BFS/DFS, Shortest Path, Multi-Model Unified View
- **Graph Visualizer** — 3D visualization với 3 chế độ (RAW/LINKED/MERGED)
- **Data Explorer** — Duyệt dữ liệu thô từng Site

---

## 🖥 Tính năng giao diện

| Tab | Tính năng |
|---|---|
| **Dashboard** | Stats cards (số papers, pairs, merges...), Top Merges, Pending Queue |
| **Resolution** | Start/stop resolution, real-time log, site health indicators |
| **Results** | Filter MERGE/REVIEW/SEPARATE, phân trang, score bars |
| **Metrics** | F1 Score, Precision/Recall bars, Topology phân tích |
| **Graph Explorer** | Distributed BFS/DFS, Shortest Path, Multi-Model Unified View, Partitioning Analysis |
| **Graph Visualizer** | 3D Force Graph, 3 chế độ (RAW/LINKED/MERGED), Gesture Camera Control |
| **Data Explorer** | Duyệt papers/authors theo bảng, chuyển đổi Site A/B |

---

## 📡 API Endpoints

### System
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/sites/status` | Trạng thái Site A, Site B |

### Entity Resolution
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/resolution/start` | Bắt đầu resolution job |
| GET | `/resolution/status` | Trạng thái job + log |
| GET | `/resolution/results` | Kết quả (filter theo decision, phân trang) |
| GET | `/resolution/stats` | Thống kê (by_decision, graph metrics) |
| GET | `/metrics/f1` | Precision/Recall/F1 so với ground truth |
| GET | `/queue` | Hàng đợi failure recovery |

### Graph Engine & Topology
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/graph/build` | Xây dựng Knowledge Graph |
| GET | `/graph/bfs` | Distributed BFS traversal |
| GET | `/graph/dfs` | Distributed DFS traversal |
| GET | `/graph/path` | Shortest Path giữa 2 nodes |
| GET | `/graph/neighbors` | Cross-site neighbors |
| GET | `/graph/data` | Graph data cho 3D visualizer |
| GET | `/partitioning/analyze` | Partitioning analysis (METIS-style) |
| GET | `/topology/analysis` | Deep topology analysis |
| GET | `/topology/clusters` | Connected components |

### Multi-Model
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/unified/paper/{id}` | Unified View (Relational + Graph + Document) |

---

## 📁 Cấu trúc thư mục

```
knowledge-graph-dedup/
│
├── .env                        # Biến môi trường (DATABASE_URL_*)
├── docker-compose.yml          # Docker orchestration (4 services)
├── start_services.py           # Script start không Docker
│
├── supabase/                   # Schema SQL cho 3 Supabase Projects
│   ├── schema_site_a.sql
│   ├── schema_site_b.sql
│   └── schema_coordinator.sql
│
├── data-pipeline/              # Script sinh & upload dữ liệu
│   ├── generate_dataset.py     # Tạo dữ liệu mẫu (SQLite)
│   ├── migrate_to_supabase.py  # Upload lên Supabase
│   ├── generate_sql_dump.py    # Export SQL dump
│   ├── requirements.txt
│   └── output/                 # SQLite databases + ground truth
│       ├── site_a.db           # 5,000 papers
│       ├── site_b.db           # 5,000 papers
│       └── ground_truth.json   # 1,000 pairs
│
├── backend/
│   ├── requirements.txt
│   │
│   ├── site-a/                 # DBLP Node (FastAPI, port 8001)
│   │   ├── main.py             # API endpoints
│   │   └── Dockerfile
│   │
│   ├── site-b/                 # Semantic Scholar Node (FastAPI, port 8002)
│   │   ├── main.py
│   │   └── Dockerfile
│   │
│   └── coordinator/            # Entity Resolution Engine (FastAPI, port 8000)
│       ├── main.py             # API + Entity Resolution logic
│       ├── graph_engine.py     # Thuật toán đồ thị (BFS/DFS/Partitioning...)
│       └── Dockerfile
│
└── frontend/                   # React Dashboard (Vite, port 3000)
    ├── src/
    │   ├── App.jsx             # Dashboard chính (7 tabs)
    │   ├── GraphExplorer.jsx   # Graph traversal UI
    │   └── GraphVisualizer.jsx # 3D Force Graph với gesture control
    ├── nginx.conf
    ├── Dockerfile
    ├── package.json
    └── vite.config.js
```

---

## ⚠️ Demo Failure Handling

Hệ thống có cơ chế chịu lỗi (Fault Tolerance) — Coordinator tự động phát hiện site bị kill và xử lý:

```bash
# 1. Trong khi Resolution đang chạy, kill Site B:
docker stop kg_site_b

# 2. Coordinator sẽ log: "Site B: ✗ — queuing pairs for retry"
#    và đưa các task vào hàng đợi

# 3. Xem hàng đợi:
curl http://localhost:8000/queue

# 4. Khởi động lại Site B:
docker start kg_site_b

# 5. Coordinator tự động retry các task bị treo khi phát hiện site online lại
```

---

## 🛠 Công nghệ sử dụng

| Công nghệ | Mục đích |
|---|---|
| **FastAPI** (Python) | REST API cho cả 3 backend services |
| **React + Vite** | Frontend dashboard |
| **ForceGraph3D** | 3D Graph Visualization |
| **NetworkX** | Thuật toán đồ thị (BFS, DFS, Connected Components, Partitioning) |
| **Supabase (PostgreSQL)** | 3 cơ sở dữ liệu độc lập |
| **Docker** | Container orchestration |
| **MediaPipe** | Hand gesture recognition (Graph Visualizer) |
| **Psycopg2** | Kết nối PostgreSQL |
| **Httpx** | HTTP client (Coordinator gọi Site A/B) |

---

## 📊 Chỉ số mục tiêu

| Metric | Target | Ý nghĩa |
|---|---|---|
| Precision | > 0.85 | Ít false merge |
| Recall | > 0.75 | Tìm được nhiều duplicate thật |
| F1 Score | > 0.80 | Cân bằng precision/recall |
| Edge-Cut Ratio | > 0.25 | Nhiều cross-site links |
| Throughput | > 200 pairs/s | Hiệu suất xử lý |

---

## 📝 Giấy phép

Project này được xây dựng cho mục đích học thuật — Distributed Database Systems.
