-- Booking Service: jalankan di PostgreSQL lokal (psql -d booking_db -f db/schema.sql)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS motorcycles (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  plate_number VARCHAR(15) NOT NULL UNIQUE,
  brand VARCHAR(50),
  model VARCHAR(50),
  year INT
);

-- service_id dan slot_id adalah referensi LOGIS ke Workshop Service (bukan foreign key),
-- integritasnya dijaga lewat pemanggilan API.
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  motorcycle_id INT NOT NULL REFERENCES motorcycles(id),
  service_id INT NOT NULL,
  slot_id INT NOT NULL,
  complaint_note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Data contoh
INSERT INTO customers (name, phone, email) VALUES ('Andi Pratama', '081234567890', 'andi@mail.com');
INSERT INTO motorcycles (customer_id, plate_number, brand, model, year) VALUES (1, 'H 1234 AB', 'Honda', 'Beat', 2020);
