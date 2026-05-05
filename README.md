# Knowledge Graph Entity Resolution & 3D Visualization
## Distributed Data De-duplication for Scientific Papers

Hệ thống hợp nhất thực thể (Entity Resolution) trên Đồ thị Tri thức phân tán, hỗ trợ trực quan hóa 3D và phân tích topology sâu.

---

## 🚀 Cấu trúc Project

```text
knowledge-graph-dedup/
├── data-pipeline/      ← Script sinh dữ liệu mẫu (SQLite)
├── backend/
│   ├── site-a/         ← DBLP Node (FastAPI)
│   ├── site-b/         ← Semantic Scholar Node (FastAPI)
│   └── coordinator/    ← Entity Resolution Engine (Central Mediator)
├── frontend/           ← React + Vite + ForceGraph3D Dashboard
└── docker-compose.yml  ← Orchestration
```

---

## 🛠 Hướng dẫn Chạy Hệ thống (Clone & Run)

### 1. Chuẩn bị Dữ liệu
Trước khi chạy Docker, bạn cần tạo dữ liệu mẫu SQLite:
```bash
cd data-pipeline
pip install -r requirements.txt
python generate_dataset.py
```
*Lệnh này sẽ tạo ra 5400 papers chia cho 2 site và 800 cặp trùng lặp thật trong thư mục `output/`.*

### 2. Khởi chạy với Docker
Quay lại thư mục gốc và chạy:
```bash
docker compose up --build
```

### 3. Truy cập Dashboard
Sau khi hệ thống khởi động thành công:
- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Coordinator API:** [http://localhost:8000](http://localhost:8000)

---

## 🖥 Khám phá Giao diện (UI Features)

Dashboard được thiết kế với phong cách hiện đại, cung cấp cái nhìn toàn diện về quá trình xử lý dữ liệu phân tán:

1.  **Dashboard:** Tổng quan các chỉ số (Stats Cards), danh sách các cặp trùng lặp hàng đầu (Top Merges) và trạng thái hàng đợi failure recovery.
2.  **Resolution:** Điều khiển trung tâm. Bấm `START RESOLUTION` để bắt đầu quá trình so khớp. Log thời gian thực sẽ hiển thị quá trình kết nối tới các Site và xử lý lỗi nếu có.
3.  **Results:** Danh sách chi tiết kết quả phân loại: `MERGE` (Trùng), `REVIEW` (Nghi vấn), `SEPARATE` (Khác biệt).
4.  **Metrics:** Biểu đồ Precision/Recall/F1-Score và phân tích Topology (Edge-Cut, Cluster Density).
5.  **Graph Explorer:** Công cụ phân tích thuật toán đồ thị:
    - Chạy **BFS/DFS phân tán**.
    - Tìm **Đường đi ngắn nhất** (Shortest Path) xuyên suốt các site.
    - Xem **Unified View**: Hợp nhất dữ liệu Relational (SQL), Graph (Network) và Document (JSON) của một thực thể.
6.  **Graph Visualizer (MỚI):** Trực quan hóa đồ thị 3D tương tác cao với 3 giai đoạn:
    - **RAW:** Xem 2 site đang tách biệt.
    - **LINKED:** Xem các liên kết đồng nhất (`SAME_AS`) nối giữa 2 site.
    - **MERGED:** Xem đồ thị "sạch" sau khi đã gộp các nút trùng thành Super-Nodes.
7.  **Data Explorer:** Duyệt dữ liệu thô của từng Site theo dạng bảng.

---

## 🧠 Phân tích Đồ thị Nâng cao

Project áp dụng các lý thuyết từ **Özsu & Valduriez (Distributed Database Systems)**:
- **Mediator/Wrapper:** Coordinator điều phối các Site API.
- **Node Collapsing:** Tự động gộp các nút thực thể trùng lặp dựa trên thuật toán Connected Components.
- **Partitioning Analysis:** So sánh Edge-Cut hiện tại với phân hoạch tối ưu (METIS-style/Kernighan-Lin).
- **Multi-Model Integration:** Hợp nhất 3 mô hình dữ liệu khác nhau trong một góc nhìn duy nhất.

---

## ⚠️ Demo Failure Handling
Bạn có thể thử nghiệm tính năng chịu lỗi (Fault Tolerance) của Coordinator:
1. Khi Resolution đang chạy, gõ: `docker stop kg_site_b`.
2. Quan sát Coordinator log: Tự động phát hiện lỗi, đưa các công việc bị gián đoạn vào hàng đợi (Queue).
3. Gõ: `docker start kg_site_b`.
4. Coordinator sẽ tự động khôi phục và xử lý tiếp các jobs trong hàng đợi.

---

## 📊 Chỉ số mục tiêu
- **F1 Score:** > 85%
- **Throughput:** > 200 pairs/sec
- **Edge-Cut:** > 25% (Thể hiện sự kết nối mạnh mẽ giữa các site sau ER)

---

## Chạy không dùng Docker (local dev)

```bash
# Terminal 1 — Site A
cd backend/site-a
pip install -r ../requirements.txt
DB_PATH=../../data-pipeline/output/site_a.db uvicorn main:app --port 8001

# Terminal 2 — Site B
cd backend/site-b
pip install -r ../requirements.txt
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
