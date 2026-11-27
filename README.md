# Sistem Booking Servis Bengkel Motor

Tugas Besar Sistem Terintegrasi, Ganjil 2026/2027. Dua service Node.js (Express) yang berkomunikasi lewat HTTP REST.

| Service | Peran | Dijalankan di | Database |
|---|---|---|---|
| `workshop-service` | Layanan servis, mekanik, slot jadwal | **Vercel** (cloud) | PostgreSQL hosted (Neon) |
| `booking-service` | Pelanggan, motor, booking | Lokal | PostgreSQL lokal |

Booking Service memanggil Workshop Service: `GET /services/:id`, `GET /slots/:id`, `GET /mechanics/:id`, dan `PUT /slots/:id` (reservasi/pembebasan slot).

## 1. Workshop Service (deploy ke Vercel)

1. Buat project di [Neon](https://neon.tech), salin connection string, lalu jalankan isi `workshop-service/db/schema.sql` di SQL Editor.
2. Salin `.env.example` menjadi `.env`, isi `DATABASE_URL`, `DATABASE_SSL=true`, `INTERNAL_API_KEY`.
3. Uji lokal: `cd workshop-service && npm install && npm run dev` (buka http://localhost:4000/docs).
4. Deploy: `npm i -g vercel && vercel` (atau import repo GitHub di dashboard Vercel). Di **Project Settings > Environment Variables** isi `DATABASE_URL`, `DATABASE_SSL=true`, `INTERNAL_API_KEY`, `PUBLIC_URL` (URL Vercel). Lalu `vercel --prod`.
5. Cek `https://<proyek>.vercel.app/health` dan `/docs`.

## 2. Booking Service (lokal)

1. Buat database: `createdb booking_db`, lalu `psql -d booking_db -f booking-service/db/schema.sql`.
2. Salin `.env.example` menjadi `.env`; isi `DATABASE_URL`, `WORKSHOP_URL` (URL Vercel), dan `INTERNAL_API_KEY` (sama dengan Workshop).
3. `cd booking-service && npm install && npm run dev` (docs: http://localhost:3000/docs).

## 3. Demo alur integrasi (curl)

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


Kelompok 3
