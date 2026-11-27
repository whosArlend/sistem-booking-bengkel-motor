# Sistem Booking Servis Bengkel Motor

> **Tugas Besar Mata Kuliah Sistem Terintegrasi &mdash; Semester Ganjil 2026/2027**  
> *Batas Pengumpulan Laporan & Presentasi: 13 Desember 2026*

Repository ini berisi implementasi sistem informasi booking servis bengkel motor berbasis arsitektur **dua microservice Node.js (Express)** yang berkomunikasi secara terintegrasi menggunakan protokol **HTTP REST API**.

---

## 1. Gambaran Arsitektur Hybrid

Sistem mengadopsi arsitektur *hybrid* yang menggabungkan layanan cloud serverless dengan layanan lokal:

| Layanan | Peran & Lingkup | Lingkungan / Hosting | Database | Base URL / Dokumentasi |
|---|---|---|---|---|
| **`workshop-service`** | Katalog jenis servis, data mekanik, manajemen slot jadwal bengkel | **Vercel** *(Serverless Function)* | PostgreSQL Cloud (**Neon**) `workshop_db` | `https://bengkel-workshop-service.vercel.app`<br>Swagger: `/docs` |
| **`booking-service`** | Data pelanggan (*customer*), kendaraan motor, dan transaksi *booking* servis | **Lokal** *(Node.js Runtime)* | PostgreSQL Lokal `booking_db` (Port `5432`) | `http://localhost:3000`<br>Swagger: `/docs` |

```
+-------------------------------------------------------------+
|                     Client / API Consumer                   |
|                   (Postman, Browser, Mobile)                |
+------------------------------+------------------------------+
                               |
            +------------------+------------------+
            | HTTP REST                           | HTTP REST
            v                                     v
+-----------------------+             +-----------------------+
|    booking-service    |             |    workshop-service   |
|   (Lokal : Port 3000) |             |    (Vercel Cloud)     |
+-----------+-----------+             +-----------+-----------+
            |                                     |
            | HTTP REST Client (fetch)            |
            | + Header: x-api-key                 |
            +------------------------------------>+
            |                                     |
            v                                     v
+-----------------------+             +-----------------------+
|   PostgreSQL Lokal    |             |  Neon PostgreSQL Cloud|
|     (booking_db)      |             |     (workshop_db)     |
+-----------------------+             +-----------------------+
```

### Mekanisme Komunikasi & Desain Terintegrasi

1. **Logical Foreign Key**:
   - Tabel `bookings` di database lokal menyimpan `service_id` dan `slot_id` sebagai **referensi logis**, bukan *foreign key* fisik SQL, karena data servis dan slot berada di database cloud yang terpisah (`workshop_db`).
   - Integritas data dijaga di lapisan aplikasi (*application layer*) melalui panggilan API sebelum data disimpan.
2. **Pengayaan Data (*Data Enrichment*)**:
   - Saat `GET /bookings/:id` dipanggil, `booking-service` mengambil data dasar booking dari database lokal, lalu secara paralel memanggil `workshop-service` (`GET /services/:id`, `GET /slots/:id`, dan `GET /mechanics/:id`) untuk menyajikan respons JSON lengkap (pelanggan, motor, layanan servis, slot jadwal, dan mekanik terkait).
3. **Reservasi Slot Atomik (*Atomic Concurrency Control*)**:
   - Untuk mencegah *race condition* (dua pelanggan memesan jam slot servis yang sama sekaligus), reservasi slot dilakukan secara atomik langsung pada mesin database `workshop-service` menggunakan query:
     ```sql
     UPDATE slots SET is_booked = TRUE WHERE id = $1 AND is_booked = FALSE RETURNING *;
     ```
   - Jika slot sudah terisi (`is_booked = true`), query menghasilkan `0 rows affected` dan `workshop-service` merespons dengan status **`409 Conflict`** (`{"error": "Slot sudah dibooking"}`).
4. **Pola Kompensasi (*Compensating Transaction / Rollback*)**:
   - Mengadopsi prinsip *Saga Pattern* tanpa beban *two-phase commit* (2PC): Jika `workshop-service` berhasil mengunci slot, namun penyimpanan data booking di database lokal `booking_db` gagal (misalnya koneksi putus atau disk penuh), `booking-service` otomatis memicu kompensasi manual dengan memanggil `PUT /slots/:id` dengan payload `{"is_booked": false}` untuk membebaskan slot kembali.
5. **Alur Reschedule & Pembatalan**:
   - **Reschedule (`PUT /bookings/:id`)**: Memesan dan mengunci slot baru terlebih dahulu (`PUT /slots/:new_id` `{ "is_booked": true }`). Jika sukses, data booking lokal diperbarui, lalu slot lama dibebaskan (`PUT /slots/:old_id` `{ "is_booked": false }`). Jika slot baru penuh, proses dibatalkan tanpa mengganggu slot lama.
   - **Pembatalan (`DELETE /bookings/:id`)**: Menghapus data booking lokal dan membebaskan slot terkait di `workshop-service` (`PUT /slots/:id` `{ "is_booked": false }`).
6. **Autentikasi Internal (`x-api-key`)**:
   - Seluruh operasi pengubahan data (tulis/update/delete) di `workshop-service` dilindungi oleh middleware verifikasi header `x-api-key`. Kunci rahasia internal diselaraskan melalui variabel lingkungan `INTERNAL_API_KEY`.

---

## 2. Panduan Konfigurasi & Menjalankan Sistem

### A. Variabel Lingkungan (`.env`)

#### 1. `booking-service/.env` (Lokal)
Buat file `booking-service/.env` berdasarkan `booking-service/.env.example`:
```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/booking_db
DATABASE_SSL=false
WORKSHOP_URL=https://bengkel-workshop-service.vercel.app
INTERNAL_API_KEY=bengkel-secret-key-2026
PUBLIC_URL=http://localhost:3000
```

#### 2. `workshop-service` (Vercel Environment Variables)
Pada dashboard Vercel (**Project Settings > Environment Variables**) atau file lokal `workshop-service/.env`:
```env
PORT=4000
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/workshop_db?sslmode=require
DATABASE_SSL=true
INTERNAL_API_KEY=bengkel-secret-key-2026
PUBLIC_URL=https://bengkel-workshop-service.vercel.app
```
> *Catatan:* Jika koneksi Neon melalui Node.js mengalami kendala *channel binding*, pastikan parameter `channel_binding=require` dihapus dari connection string.

---

### B. Menyiapkan Database PostgreSQL Lokal

1. **Pastikan PostgreSQL aktif** di mesin lokal (PostgreSQL Windows service atau WSL di port `5432`).
2. **Buat database lokal `booking_db`**:
   ```bash
   createdb booking_db
   ```
   *(Atau melalui psql: `CREATE DATABASE booking_db;`)*
3. **Eksekusi file skema database**:
   ```bash
   psql -d booking_db -f booking-service/db/schema.sql
   ```
   Skema ini membuat tabel `customers`, `motorcycles`, dan `bookings`, serta menyertakan data awal contoh.

---

### C. Menjalankan `booking-service`

1. Masuk ke direktori service dan install dependensi:
   ```bash
   cd booking-service
   npm install
   ```
2. Jalankan server dalam mode pengembangan:
   ```bash
   npm run dev
   ```
3. Layanan akan berjalan di `http://localhost:3000`. Akses dokumentasi interaktif Swagger UI di:
   - **Swagger UI**: [http://localhost:3000/docs](http://localhost:3000/docs)
   - **Health Check**: [http://localhost:3000/health](http://localhost:3000/health)

---

### D. Dokumentasi API & Ekspor OpenAPI

Setiap service dilengkapi script untuk memperbarui dokumen spesifikasi OpenAPI:
```bash
# Di direktori booking-service atau workshop-service:
npm run docs
```
Perintah ini membaca definisi rute dan meng-export file `docs/openapi.json` yang siap di-import ke Postman maupun Swagger Inspector.

---

## 3. Ringkasan Endpoint Utama

### `workshop-service` (`https://bengkel-workshop-service.vercel.app`)

| Method | Endpoint | Deskripsi | Autentikasi |
|---|---|---|:---:|
| `GET` | `/health` | Memeriksa status kesehatan server | Publik |
| `GET` | `/docs` | Swagger UI dokumentasi API interaktif | Publik |
| `GET` | `/services` | Mengambil katalog layanan servis | Publik |
| `GET` | `/services/:id` | Mengambil detail layanan servis tertentu | Publik |
| `GET` | `/mechanics` | Mengambil daftar mekanik bengkel | Publik |
| `GET` | `/slots?is_booked=false` | Mengambil slot jadwal yang masih tersedia | Publik |
| `GET` | `/slots/:id` | Mengambil detail slot jadwal tertentu | Publik |
| `PUT` | `/slots/:id` | Reservasi atomik (`{"is_booked": true}`) atau pembebasan slot | Header `x-api-key` |
| `POST` | `/services`, `/mechanics`, `/slots` | Menambahkan data master baru | Header `x-api-key` |

### `booking-service` (`http://localhost:3000`)

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/health` | Memeriksa status server booking lokal |
| `GET` | `/docs` | Swagger UI dokumentasi API interaktif |
| `GET` | `/customers` | Mengambil daftar pelanggan |
| `POST` | `/customers` | Menambahkan pelanggan baru |
| `GET` | `/motorcycles` | Mengambil daftar motor pelanggan |
| `POST` | `/motorcycles` | Mendaftarkan motor pelanggan baru |
| `GET` | `/bookings` | Mengambil daftar booking (filter: `status`, `customer_id`, `motorcycle_id`) |
| `GET` | `/bookings/:id` | Detail booking lengkap (diperkaya data servis & mekanik dari cloud) |
| `POST` | `/bookings` | Membuat booking baru, validasi motor & servis, reservasi slot atomik |
| `PUT` | `/bookings/:id` | Memperbarui status booking atau *reschedule* ke slot jadwal baru |
| `DELETE` | `/bookings/:id` | Membatalkan/menghapus booking dan membuka kembali slot di cloud |

---

## 4. Skenario Pengujian Integrasi End-to-End

Gunakan perintah `curl` berikut di terminal untuk mendemonstrasikan seluruh alur pengujian integrasi:

```bash
# Definisi URL variabel
W="https://bengkel-workshop-service.vercel.app"
B="http://localhost:3000"
KEY="bengkel-secret-key-2026"
```

### Skenario 1: Cek Ketersediaan Slot Jadwal di Cloud
```bash
curl -X GET "$W/slots?is_booked=false"
```
*Ekspektasi:* Mengembalikan array slot jadwal dengan `is_booked: false` (Status `200 OK`).

---

### Skenario 2: Pembuatan Booking Baru (`201 Created`)
```bash
curl -X POST "$B/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "motorcycle_id": 1,
    "service_id": 1,
    "slot_id": 1,
    "complaint_note": "Ganti oli mesin dan servis rutin"
  }'
```
*Ekspektasi:* 
- Mengembalikan data booking dengan status **`201 Created`**.
- Slot `1` pada `workshop-service` di Vercel otomatis berubah menjadi `is_booked: true`.
- Respons sudah diperkaya dengan objek `service`, `slot`, dan `mechanic`.

---

### Skenario 3: Melihat Detail Booking Lengkap
```bash
curl -X GET "$B/bookings/1"
```
*Ekspektasi:* Mengembalikan detail booking nomor `1` beserta data gabungan dari cloud (Status `200 OK`).

---

### Skenario 4: Reschedule Jadwal ke Slot Baru
```bash
curl -X PUT "$B/bookings/1" \
  -H "Content-Type: application/json" \
  -d '{"slot_id": 2}'
```
*Ekspektasi:* Slot `1` otomatis dilepas kembali (`is_booked: false`), slot `2` dikunci (`is_booked: true`), dan data booking lokal diperbarui (Status `200 OK`).

---

### Skenario 5: Uji Konflik Slot Ganda (`409 Conflict`)
Coba buat booking baru yang menargetkan slot `2` yang baru saja dipesan pada skenario 4:
```bash
curl -X POST "$B/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "motorcycle_id": 1,
    "service_id": 1,
    "slot_id": 2
  }'
```
*Ekspektasi:* Sistem menolak transaksi dan mengembalikan status **`409 Conflict`**:
```json
{
  "error": "Slot sudah dibooking"
}
```

---

### Skenario 6: Pembatalan Booking & Pembebasan Slot
```bash
curl -X DELETE "$B/bookings/1"
```
*Ekspektasi:* Data booking dihapus (Status `200 OK`) dan slot `2` di `workshop-service` otomatis dibebaskan kembali (`is_booked: false`).

---

### Skenario 7: Uji Keamanan Autentikasi Internal (`401 Unauthorized`)
Coba ubah status slot secara langsung ke `workshop-service` tanpa header `x-api-key`:
```bash
curl -X PUT "$W/slots/1" \
  -H "Content-Type: application/json" \
  -d '{"is_booked": true}'
```
*Ekspektasi:* Server cloud menolak request dengan status **`401 Unauthorized`**:
```json
{
  "error": "API key tidak valid"
}
```

---

### Skenario 8: Uji Penanganan Downtime Layanan Eksternal (`502 Bad Gateway`)
Jika `WORKSHOP_URL` pada `booking-service/.env` tidak dapat dihubungi atau mengalami timeout (melebihi batas toleransi 8 detik), panggilan API booking akan memutus transaksi secara aman dan menghasilkan respons:
```json
{
  "error": "Workshop Service tidak dapat dihubungi"
}
```
*(Status HTTP `502 Bad Gateway`)*, mencegah terjadinya data *orphan* atau inkonsistensi status slot.

---

## 5. Struktur Direktori Proyek

```
sistem-booking-bengkel-motor/
├── booking-service/              # Layanan Pelanggan & Booking (Lokal)
│   ├── db/
│   │   └── schema.sql            # DDL Tabel customers, motorcycles, bookings
│   ├── docs/
│   │   └── openapi.json          # File OpenAPI Specification (Swagger)
│   ├── scripts/
│   │   └── export-openapi.js     # Script generator openapi.json
│   ├── src/
│   │   ├── app.js                # Inisialisasi Express & konfigurasi routing
│   │   ├── bookings.js           # Business logic booking & transaksi kompensasi
│   │   ├── crud.js               # Handler standar operasi CRUD database
│   │   ├── db.js                 # Pool connection PostgreSQL lokal
│   │   ├── docs.js               # Render UI Swagger HTML
│   │   ├── openapi.js            # Definisi skema rute OpenAPI
│   │   ├── server.js             # Entry point HTTP server lokal
│   │   └── workshopClient.js     # HTTP client pemanggil Workshop Service
│   ├── .env.example              # Template variabel lingkungan booking-service
│   └── package.json
│
├── workshop-service/             # Layanan Bengkel & Slot (Vercel Cloud)
│   ├── api/
│   │   └── index.js              # Entry point Vercel Serverless Function
│   ├── db/
│   │   └── schema.sql            # DDL Tabel services, mechanics, slots
│   ├── docs/
│   │   └── openapi.json          # File OpenAPI Specification (Swagger)
│   ├── scripts/
│   │   └── export-openapi.js     # Script generator openapi.json
│   ├── src/
│   │   ├── app.js                # Routing, middleware auth, & Swagger
│   │   ├── crud.js               # Handler standar operasi CRUD database
│   │   ├── db.js                 # Pool connection Neon PostgreSQL Cloud (SSL)
│   │   ├── docs.js               # Render UI Swagger HTML
│   │   ├── openapi.js            # Definisi skema rute OpenAPI
│   │   ├── server.js             # Entry point Express lokal (fallback)
│   │   └── slotReserve.js        # Logic reservasi slot atomik (WHERE is_booked=FALSE)
│   ├── .env.example              # Template variabel lingkungan workshop-service
│   ├── package.json
│   └── vercel.json               # Konfigurasi rewrites deployment Vercel
│
├── .gitignore                    # Mengabaikan node_modules, .env, .vercel
└── README.md                     # Dokumentasi arsitektur, panduan, dan skenario uji
```

---

## 6. Anggota Tim & Kontribusi

Proyek ini disusun untuk memenuhi evaluasi Tugas Besar mata kuliah **Sistem Terintegrasi** (Semester Ganjil 2026/2027). Seluruh konfigurasi, implementasi logika transaksi terdistribusi, serta skenario pengujian telah divalidasi end-to-end.
