# Sistem Booking Servis Bengkel Motor

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
W=https://<proyek>.vercel.app   # Workshop Service
B=http://localhost:3000         # Booking Service

curl $W/slots?is_booked=false                      # lihat slot kosong
curl -X POST $B/bookings -H 'Content-Type: application/json' \
  -d '{"customer_id":1,"motorcycle_id":1,"service_id":1,"slot_id":1,"complaint_note":"Ganti oli"}'
curl $B/bookings/1                                 # detail (digabung data Workshop)
curl -X PUT $B/bookings/1 -H 'Content-Type: application/json' -d '{"status":"confirmed"}'
curl -X PUT $B/bookings/1 -H 'Content-Type: application/json' -d '{"slot_id":2}'   # reschedule
curl -X POST $B/bookings -H 'Content-Type: application/json' \
  -d '{"customer_id":1,"motorcycle_id":1,"service_id":1,"slot_id":2}'               # 409: slot sudah terisi
curl -X DELETE $B/bookings/1                       # batal, slot dibuka kembali
```

## 4. Dokumentasi API

Swagger UI ada di `/docs` setiap service. Untuk Postman: `npm run docs` di tiap service menghasilkan `docs/openapi.json`, lalu **Import** di Postman.

## Catatan desain

- `service_id` dan `slot_id` di tabel `bookings` adalah referensi logis (bukan foreign key) karena datanya ada di database service lain.
- Reservasi slot atomik (`UPDATE ... WHERE is_booked = FALSE`), sehingga dua booking tidak bisa mengambil slot yang sama.
- Jika penyimpanan booking gagal setelah slot dipesan, Booking Service membebaskan slot kembali (kompensasi manual).
- Operasi tulis di Workshop Service dilindungi header `x-api-key` bila `INTERNAL_API_KEY` diatur.
