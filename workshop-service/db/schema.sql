-- Workshop Service: jalankan di SQL Editor Neon (atau psql)
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  duration_minutes INT NOT NULL
);

CREATE TABLE IF NOT EXISTS mechanics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  specialization VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS slots (
  id SERIAL PRIMARY KEY,
  mechanic_id INT NOT NULL REFERENCES mechanics(id),
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_booked BOOLEAN DEFAULT FALSE,
  UNIQUE (mechanic_id, slot_date, start_time)
);

-- Data contoh
INSERT INTO services (name, description, price, duration_minutes) VALUES
  ('Ganti Oli', 'Ganti oli mesin + cek ringan', 55000, 30),
  ('Tune Up', 'Servis berkala mesin dan kelistrikan', 150000, 90),
  ('Servis Rem', 'Cek dan ganti kampas rem', 80000, 45),
  ('Servis CVT', 'Bersihkan dan cek komponen CVT', 120000, 60);

INSERT INTO mechanics (name, specialization) VALUES
  ('Budi', 'Mesin'), ('Rina', 'Kelistrikan'), ('Agus', 'CVT & Rem');

INSERT INTO slots (mechanic_id, slot_date, start_time, end_time) VALUES
  (1, CURRENT_DATE + 1, '09:00', '10:00'), (1, CURRENT_DATE + 1, '10:00', '11:00'),
  (2, CURRENT_DATE + 1, '09:00', '10:00'), (2, CURRENT_DATE + 2, '13:00', '14:00'),
  (3, CURRENT_DATE + 2, '09:00', '10:00'), (3, CURRENT_DATE + 2, '10:00', '11:00');
