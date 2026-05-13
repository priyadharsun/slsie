'use strict';
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, WidthType, ShadingType, BorderStyle } = require('docx');

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const db = new DatabaseSync(path.join(__dirname, 'slsie.db'));

db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  federation_id INTEGER,
  initials TEXT
);

CREATE TABLE IF NOT EXISTS federations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  established_year INTEGER,
  president TEXT,
  secretary TEXT,
  total_members INTEGER DEFAULT 0,
  athletes_count INTEGER DEFAULT 0,
  province TEXT,
  color TEXT DEFAULT '#2E75B6'
);

CREATE TABLE IF NOT EXISTS governance_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  federation_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  board_composition REAL DEFAULT 0,
  director_skills REAL DEFAULT 0,
  strategic_planning REAL DEFAULT 0,
  financial_transparency REAL DEFAULT 0,
  integrity_risk REAL DEFAULT 0,
  stakeholder_engagement REAL DEFAULT 0,
  regulatory_compliance REAL DEFAULT 0,
  culture_score REAL DEFAULT 0,
  total_score REAL DEFAULT 0,
  status TEXT DEFAULT 'submitted',
  submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(federation_id, year)
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT,
  birth_year INTEGER,
  province TEXT,
  school TEXT,
  federation_id INTEGER,
  sport TEXT,
  participant_type TEXT DEFAULT 'athlete',
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS biometric_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  record_date TEXT NOT NULL,
  height_cm REAL,
  weight_kg REAL,
  bmi REAL,
  body_fat_pct REAL,
  heart_rate INTEGER,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  sleep_quality INTEGER,
  stress_level INTEGER,
  mental_wellbeing INTEGER,
  soreness INTEGER
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  log_date TEXT NOT NULL,
  activity_type TEXT,
  duration_mins INTEGER,
  distance_km REAL,
  steps INTEGER,
  calories INTEGER
);

CREATE TABLE IF NOT EXISTS performance_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  test_date TEXT NOT NULL,
  test_type TEXT NOT NULL,
  result REAL NOT NULL,
  unit TEXT,
  conditions TEXT
);

CREATE TABLE IF NOT EXISTS training_loads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  load_date TEXT NOT NULL,
  session_type TEXT,
  distance_km REAL,
  duration_mins INTEGER,
  heart_rate INTEGER,
  acute_load REAL,
  chronic_load REAL,
  acwr REAL
);
`);

// ─── SEED ─────────────────────────────────────────────────────────────────────
function seed() {
  // Users
  const users = [
    ['NOCSL Admin', 'admin@nocsl.lk', 'admin123', 'admin', null, 'NA'],
    ['Shammi Silva', 'cricket@nocsl.lk', 'fed123', 'federation', 1, 'SS'],
    ['Jagath Perera', 'athletics@nocsl.lk', 'fed123', 'federation', 2, 'JP'],
    ['Tharanga Wijeratne', 'coach@athletics.lk', 'coach123', 'coach', 2, 'TW'],
    ['Ministry of Sports', 'ministry@sports.gov.lk', 'gov123', 'ministry', null, 'MS'],
    ['UNDP Sri Lanka', 'donor@undp.lk', 'donor123', 'donor', null, 'UN'],
  ];
  const insUser = db.prepare('INSERT INTO users (name,email,password,role,federation_id,initials) VALUES (?,?,?,?,?,?)');
  users.forEach(u => insUser.run(...u));

  // Federations (all 34)
  const feds = [
    ['Sri Lanka Cricket', 'Cricket', 1948, 'Shammi Silva', 'Mohan de Silva', 32000, 856, 'Western', '#1F4E79'],
    ['Athletics Sri Lanka', 'Athletics', 1922, 'Jagath Perera', 'Nimal Fernando', 8500, 420, 'Western', '#2E75B6'],
    ['Sri Lanka Football Federation', 'Football', 1939, 'Jaswar Umar', 'Sampath Nanayakkara', 14000, 1200, 'Western', '#1A5276'],
    ['Sri Lanka Swimming Federation', 'Swimming', 1947, 'Asanka Gurusinha', 'Priyanka Jayawardena', 3200, 280, 'Western', '#2980B9'],
    ['Sri Lanka Badminton Association', 'Badminton', 1948, 'Dilhara Fernando', 'Roshan Jayakody', 4500, 350, 'Western', '#117A65'],
    ['Sri Lanka Rugby Football Union', 'Rugby', 1908, 'Lasitha Gunaratne', 'Chathura Perera', 2800, 240, 'Western', '#1E8449'],
    ['Sri Lanka Tennis Association', 'Tennis', 1915, 'Chandra Navaratnam', 'Sumudu Ediriweera', 2100, 180, 'Western', '#6C3483'],
    ['Sri Lanka Boxing Association', 'Boxing', 1956, 'Pathum Nissanka', 'Kavinda Rajapaksha', 1800, 160, 'Central', '#922B21'],
    ['Sri Lanka Volleyball Federation', 'Volleyball', 1951, 'Sunanda Ratnayake', 'Udara Perera', 3600, 290, 'Southern', '#CA6F1E'],
    ['Sri Lanka Basketball Federation', 'Basketball', 1954, 'Ravi Wijeratne', 'Chathu Samarasinghe', 2400, 210, 'Western', '#D35400'],
    ['Sri Lanka Cycling Federation', 'Cycling', 1948, 'Nishantha De Mel', 'Duminda Priyantha', 1500, 120, 'Western', '#16A085'],
    ['Sri Lanka Shooting Association', 'Shooting', 1952, 'Brigadier Suresh', 'Mayuri Pieris', 900, 85, 'Western', '#7F8C8D'],
    ['Sri Lanka Weightlifting Federation', 'Weightlifting', 1946, 'Dayawansa Jayakody', 'Prasad Kumara', 1100, 95, 'Central', '#2C3E50'],
    ['Sri Lanka Wrestling Federation', 'Wrestling', 1950, 'Chandana Wickremasinghe', 'Dilip Kumara', 1300, 110, 'North Western', '#6C3483'],
    ['Sri Lanka Judo Federation', 'Judo', 1958, 'Thilanka Boteju', 'Ruchira Abeyratne', 1600, 130, 'Western', '#1F618D'],
    ['Sri Lanka Table Tennis Association', 'Table Tennis', 1950, 'Anusha Fernando', 'Pradeep Kodithuwakku', 2200, 190, 'Western', '#0E6655'],
    ['Sri Lanka Archery Association', 'Archery', 1972, 'Rohitha Abeygunawardena', 'Nimali Peris', 800, 70, 'Central', '#145A32'],
    ['Sri Lanka Gymnastics Federation', 'Gymnastics', 1963, 'Malathi de Silva', 'Sanduni Rathnasiri', 1200, 100, 'Western', '#F39C12'],
    ['Sri Lanka Karate Federation', 'Karate', 1970, 'Nalaka Hewavitharana', 'Uditha Manawadu', 3800, 320, 'Western', '#E74C3C'],
    ['Sri Lanka Taekwondo Association', 'Taekwondo', 1976, 'Supun Jayasuriya', 'Dilshani Kumarasinghe', 2900, 250, 'Western', '#2471A3'],
    ['Sri Lanka Squash Rackets Federation', 'Squash', 1974, 'Chaminda Vaas', 'Sachini de Silva', 1100, 90, 'Western', '#A93226'],
    ['Sri Lanka Netball Federation', 'Netball', 1948, 'Sudharma Rajapaksha', 'Indrani Gomes', 4200, 360, 'Western', '#884EA0'],
    ['Sri Lanka Hockey Federation', 'Hockey', 1929, 'Dulip Liyanage', 'Kamalini Jayaratne', 2700, 230, 'North Western', '#0B5345'],
    ['Sri Lanka Rowing Federation', 'Rowing', 1955, 'Sanath Mendis', 'Kumudini Perera', 600, 55, 'Western', '#1A5276'],
    ['Sri Lanka Sailing Association', 'Sailing', 1963, 'Rohan Mathes', 'Tharaka Bandara', 500, 45, 'Western', '#117864'],
    ['Sri Lanka Equestrian Federation', 'Equestrian', 1968, 'Col. Rohana Silva', 'Manori Rajapaksha', 400, 35, 'Central', '#784212'],
    ['Sri Lanka Triathlon Federation', 'Triathlon', 2005, 'Ravin Wickremaratne', 'Surani Jayaratne', 700, 60, 'Western', '#1F618D'],
    ['Sri Lanka Wushu Federation', 'Wushu', 1988, 'Manjula Kulatunga', 'Thilini Madusara', 1400, 115, 'Western', '#A93226'],
    ['Sri Lanka Pencak Silat Federation', 'Pencak Silat', 1992, 'Amil Hassan', 'Nadeesha Kumari', 900, 75, 'Eastern', '#6E2F2F'],
    ['Sri Lanka Chess Federation', 'Chess', 1950, 'Isuru Chathuranga', 'Maduri Wickramasinghe', 2500, 210, 'Western', '#2C3E50'],
    ['Sri Lanka Muay Thai Association', 'Muay Thai', 2010, 'Sanura Bandara', 'Kasun Madushanka', 1100, 90, 'Western', '#A04000'],
    ['Sri Lanka Sepak Takraw Federation', 'Sepak Takraw', 1995, 'Mohamed Riyaz', 'Fathima Salma', 800, 65, 'Eastern', '#1E8449'],
    ['Sri Lanka Esports Federation', 'Esports', 2018, 'Kavish Rodrigo', 'Senura Jayasinghe', 5000, 450, 'Western', '#6C3483'],
    ['Sri Lanka Obstacle Racing Federation', 'Obstacle Racing', 2016, 'Lahiru Madusanka', 'Thisara Perera', 1300, 110, 'Western', '#117A65'],
  ];
  const insFed = db.prepare('INSERT INTO federations (name,sport,established_year,president,secretary,total_members,athletes_count,province,color) VALUES (?,?,?,?,?,?,?,?,?)');
  feds.forEach(f => insFed.run(...f));

  // Governance scores 2025 (20 submitted, 14 pending)
  // [fedId, board, skills, strategy, finance, integrity, stakeholder, compliance, culture]
  const g2025 = [
    [1,  4.5, 4.4, 4.6, 4.7, 4.5, 4.3, 4.8, 4.2],
    [2,  4.2, 4.0, 4.3, 4.1, 4.0, 4.2, 4.5, 3.9],
    [3,  3.8, 3.6, 3.9, 3.7, 3.8, 3.5, 4.0, 3.6],
    [4,  4.0, 3.9, 4.1, 4.0, 3.8, 4.0, 4.2, 3.8],
    [5,  3.6, 3.5, 3.7, 3.4, 3.6, 3.8, 3.5, 3.5],
    [6,  3.4, 3.3, 3.5, 3.2, 3.4, 3.6, 3.3, 3.3],
    [7,  3.2, 3.0, 3.3, 3.1, 3.2, 3.0, 3.4, 2.9],
    [8,  3.0, 2.9, 3.1, 2.8, 3.0, 2.7, 3.2, 2.8],
    [9,  2.8, 2.6, 2.9, 2.5, 2.7, 2.9, 2.6, 2.7],
    [10, 2.5, 2.3, 2.6, 2.2, 2.4, 2.6, 2.3, 2.4],
    [11, 2.3, 2.1, 2.4, 2.0, 2.2, 2.4, 2.1, 2.2],
    [12, 2.0, 1.8, 2.1, 1.7, 1.9, 2.1, 1.8, 1.9],
    [13, 1.8, 1.6, 1.9, 1.5, 1.7, 1.9, 1.6, 1.7],
    [14, 1.5, 1.4, 1.6, 1.3, 1.5, 1.7, 1.4, 1.5],
    [15, 3.5, 3.4, 3.6, 3.3, 3.4, 3.7, 3.4, 3.2],
    [16, 3.7, 3.6, 3.8, 3.5, 3.6, 3.9, 3.6, 3.5],
    [17, 4.1, 4.0, 4.2, 3.9, 4.0, 4.3, 4.1, 3.9],
    [18, 2.9, 2.7, 3.0, 2.6, 2.8, 3.0, 2.7, 2.8],
    [19, 3.3, 3.2, 3.4, 3.0, 3.2, 3.5, 3.2, 3.1],
    [20, 3.9, 3.8, 4.0, 3.7, 3.8, 4.1, 3.8, 3.7],
  ];
  const g2024 = [
    [1,  4.1, 4.0, 4.2, 4.3, 4.1, 3.9, 4.4, 3.8],
    [2,  3.8, 3.6, 3.9, 3.7, 3.6, 3.8, 4.1, 3.5],
    [3,  3.4, 3.2, 3.5, 3.3, 3.4, 3.1, 3.6, 3.2],
    [4,  3.6, 3.5, 3.7, 3.6, 3.4, 3.6, 3.8, 3.4],
    [15, 3.1, 3.0, 3.2, 2.9, 3.0, 3.3, 3.0, 2.8],
    [16, 3.3, 3.2, 3.4, 3.1, 3.2, 3.5, 3.2, 3.1],
    [17, 3.7, 3.6, 3.8, 3.5, 3.6, 3.9, 3.7, 3.5],
    [20, 3.5, 3.4, 3.6, 3.3, 3.4, 3.7, 3.4, 3.3],
  ];
  const insScore = db.prepare(`INSERT INTO governance_scores
    (federation_id,year,board_composition,director_skills,strategic_planning,
     financial_transparency,integrity_risk,stakeholder_engagement,
     regulatory_compliance,culture_score,total_score,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  g2025.forEach(([fid, ...s]) => {
    const total = +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2);
    insScore.run(fid, 2025, ...s, total, 'submitted');
  });
  g2024.forEach(([fid, ...s]) => {
    const total = +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2);
    insScore.run(fid, 2024, ...s, total, 'submitted');
  });

  // Athletes (47 across 20 federations)
  const athletes = [
    ['Dinesh Chandimal',      'M', 1989, 'Western',       'SL Cricket Academy', 1, 'Cricket'],
    ['Kusal Mendis',          'M', 1995, 'Southern',      'Richmond College',   1, 'Cricket'],
    ['Chamari Athapaththu',   'F', 1990, 'Southern',      'Southlands College', 1, 'Cricket'],
    ['Pathum Nissanka',       'M', 1998, 'Western',       'Nithyanandarama MV', 1, 'Cricket'],
    ['Tharushi Karunarathna', 'F', 2003, 'Sabaragamuwa',  'Sabaragamuwa Uni',   2, 'Athletics'],
    ['Niluka Karunaratne',    'F', 1994, 'Central',       'Dharmaraja College', 2, 'Athletics'],
    ['Vinoj Suranga',         'M', 1996, 'Western',       'Wesley College',     2, 'Athletics'],
    ['Anura Dharshana',       'M', 1999, 'Uva',           'Bandarawela College',2, 'Athletics'],
    ['Channa Ediri',          'M', 1997, 'Western',       'St Thomas College',  3, 'Football'],
    ['Sujan Perera',          'M', 2000, 'North Western', 'St Joseph College',  3, 'Football'],
    ['Mohamed Riyaz',         'M', 1995, 'Eastern',       'Batticaloa Central', 3, 'Football'],
    ['Akalanka Peiris',       'M', 2001, 'Western',       'Royal College',      4, 'Swimming'],
    ['Jenali de Zoysa',       'F', 2002, 'Western',       'Ladies College',     4, 'Swimming'],
    ['Ramesh Jayakody',       'M', 1999, 'Central',       'Trinity College',    4, 'Swimming'],
    ['Buwaneka Goonethilleke','M', 1996, 'Western',       'Nalanda College',    5, 'Badminton'],
    ['Sachintha Avishka',     'M', 2000, 'Southern',      'Mahinda College',    5, 'Badminton'],
    ['Hasini Ambalangodage',  'F', 1998, 'Western',       'Museaus College',    5, 'Badminton'],
    ['Danushka Ranjan',       'M', 1994, 'Western',       'S Thomas College',   6, 'Rugby'],
    ['Janith Liyanage',       'M', 1997, 'Southern',      'Galle National',     6, 'Rugby'],
    ['Harshitha Jayawardena', 'F', 2001, 'Western',       'DS Senanayake',      7, 'Tennis'],
    ['Naveen Fernando',       'M', 1999, 'Western',       'Thurstan College',   7, 'Tennis'],
    ['Lalith Kumara',         'M', 1998, 'Central',       'Dharmaraja College', 8, 'Boxing'],
    ['Pradeep Malinga',       'M', 1995, 'Southern',      'Richmond College',   8, 'Boxing'],
    ['Malsha Dissanayake',    'F', 2002, 'Sabaragamuwa',  'Maliyadeva Girls',   9, 'Volleyball'],
    ['Asanka Rajapaksha',     'M', 1996, 'Southern',      'Galle Central',      9, 'Volleyball'],
    ['Nimesh Wijeratne',      'M', 1997, 'Western',       'Ananda College',     10, 'Basketball'],
    ['Thilini Rajapaksha',    'F', 2001, 'Western',       'Visakha Vidyalaya',  10, 'Basketball'],
    // Federations 11-20
    ['Chaminda Vithanage',    'M', 1997, 'Western',       'Ananda College',     11, 'Cycling'],
    ['Ruwini Jayawardena',    'F', 2001, 'Central',       'Gatambe MV',         11, 'Cycling'],
    ['Susith Gunawardena',    'M', 1993, 'Western',       'Dharmaraja College', 12, 'Shooting'],
    ['Imesha Karunarathna',   'F', 1999, 'Southern',      'Mahinda College',    12, 'Shooting'],
    ['Chamath Rajapaksha',    'M', 1996, 'Central',       'Trinity College',    13, 'Weightlifting'],
    ['Udari Fernando',        'F', 2000, 'Western',       'Visakha Vidyalaya',  13, 'Weightlifting'],
    ['Lahiru Dissanayake',    'M', 1995, 'North Western', 'Maliyadeva College', 14, 'Wrestling'],
    ['Sandun Kumara',         'M', 1998, 'Sabaragamuwa',  'Sabaragamuwa MV',    14, 'Wrestling'],
    ['Nuwan Priyantha',       'M', 1994, 'Western',       'Nalanda College',    15, 'Judo'],
    ['Methmi Wickramasinghe', 'F', 2002, 'Western',       'Ladies College',     15, 'Judo'],
    ['Jayashan Perera',       'M', 2000, 'Western',       'Royal College',      16, 'Table Tennis'],
    ['Senuri Rathnayake',     'F', 2003, 'Southern',      'Southlands College', 16, 'Table Tennis'],
    ['Kasun Madushanka',      'M', 1996, 'Central',       'Dharmaraja College', 17, 'Archery'],
    ['Dilini Karunarathna',   'F', 2001, 'Sabaragamuwa',  'Maliyadeva Girls',   17, 'Archery'],
    ['Ridma Wijeratne',       'F', 2004, 'Western',       'Museaus College',    18, 'Gymnastics'],
    ['Amaya Rathnasiri',      'F', 2002, 'Western',       'DS Senanayake',      18, 'Gymnastics'],
    ['Akila Perera',          'M', 1998, 'Western',       'Thurstan College',   19, 'Karate'],
    ['Chathurika Jayasinghe', 'F', 2000, 'Western',       'Visakha Vidyalaya',  19, 'Karate'],
    ['Malitha Senanayake',    'M', 1997, 'Western',       'S Thomas College',   20, 'Taekwondo'],
    ['Hashini Bandara',       'F', 2001, 'Central',       'Dharmaraja Girls',   20, 'Taekwondo'],
  ];
  const insAth = db.prepare('INSERT INTO participants (name,gender,birth_year,province,school,federation_id,sport,participant_type,status) VALUES (?,?,?,?,?,?,?,?,?)');
  athletes.forEach(a => insAth.run(...a, 'athlete', 'active'));

  // Biometric base values per athlete [height_cm, weight_kg, body_fat_pct, heart_rate]
  const bioBase = [
    [183, 78, 11.2, 58], [178, 72, 11.8, 62], [163, 62, 18.5, 60], [181, 75, 10.5, 65],
    [158, 50, 12.0, 52], [162, 55, 16.2, 55], [175, 70, 13.5, 60], [172, 68, 13.9, 63],
    [177, 73, 14.2, 67], [180, 77, 13.8, 68], [174, 71, 14.5, 65], [183, 81, 10.8, 58],
    [165, 58, 16.5, 55], [180, 79, 11.2, 60], [175, 70, 14.0, 62], [172, 67, 13.5, 60],
    [160, 55, 16.8, 57], [185, 90,  9.8, 55], [180, 85, 10.2, 57], [163, 58, 16.0, 60],
    [178, 74, 13.2, 62], [176, 72, 12.5, 58], [174, 71, 13.0, 60], [166, 60, 16.0, 57],
    [180, 78, 13.5, 62], [183, 82, 10.5, 60], [168, 63, 15.5, 58],
    // feds 11-20
    [175, 72, 13.0, 60], [168, 63, 14.5, 62], // Cycling
    [176, 78, 12.5, 58], [165, 62, 16.0, 60], // Shooting
    [176, 82, 12.0, 58], [168, 75, 14.0, 60], // Weightlifting
    [180, 85, 11.5, 57], [175, 78, 12.5, 59], // Wrestling
    [174, 71, 13.5, 61], [163, 60, 16.5, 63], // Judo
    [170, 65, 14.0, 62], [162, 54, 17.0, 64], // Table Tennis
    [175, 70, 13.2, 60], [163, 56, 16.0, 62], // Archery
    [165, 54, 17.5, 62], [158, 48, 19.0, 65], // Gymnastics
    [173, 70, 13.5, 61], [166, 62, 16.5, 63], // Karate
    [174, 72, 13.8, 60], [165, 61, 16.5, 62], // Taekwondo
  ];
  const months = ['2024-12-01','2025-01-01','2025-02-01','2025-03-01','2025-04-01','2025-05-01'];
  const insBio = db.prepare('INSERT INTO biometric_records (participant_id,record_date,height_cm,weight_kg,bmi,body_fat_pct,heart_rate,bp_systolic,bp_diastolic,sleep_quality,stress_level,mental_wellbeing,soreness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');

  // Simple deterministic variation
  let rng = 42;
  function rand() { rng = (rng * 1664525 + 1013904223) & 0x7fffffff; return rng / 0x7fffffff; }
  function rRange(lo, hi) { return lo + (hi - lo) * rand(); }

  for (let pid = 1; pid <= 47; pid++) {
    const [h, w0, bf0, hr0] = bioBase[pid - 1];
    months.forEach((dt, mi) => {
      const wDrift = pid === 1 ? mi * 0.3 : (rand() - 0.48) * 0.8; // Chandimal gaining weight (overtraining)
      const w = +(w0 + wDrift).toFixed(1);
      const bmi = +(w / ((h / 100) ** 2)).toFixed(1);
      const bf = +(bf0 + (rand() - 0.5) * 1.5).toFixed(1);
      const hr = Math.round(hr0 + (rand() - 0.5) * 8);
      const bpS = Math.round(112 + rand() * 16);
      const bpD = Math.round(72 + rand() * 12);
      const sleep = Math.round(5 + rand() * 4);
      const stress = pid === 1 ? Math.round(4 + mi * 0.6 + rand()) : Math.round(2 + rand() * 5); // Chandimal stress rising
      const mental = Math.round(6 + rand() * 4);
      const soreness = pid === 1 ? Math.round(3 + mi * 0.5) : Math.round(1 + rand() * 5);
      insBio.run(pid, dt, h, w, bmi, bf, hr, bpS, bpD, sleep, stress, mental, soreness);
    });
  }

  // Training loads (10 weekly records per athlete)
  const insLoad = db.prepare('INSERT INTO training_loads (participant_id,load_date,session_type,distance_km,duration_mins,heart_rate,acute_load,chronic_load,acwr) VALUES (?,?,?,?,?,?,?,?,?)');
  const sessions = ['Endurance Run','Interval Training','Strength & Conditioning','Skills Drill','Recovery Run','Match Simulation','Speed Work'];

  for (let pid = 1; pid <= 47; pid++) {
    for (let w = 0; w < 10; w++) {
      const d = new Date(2025, 4, 12 - w * 7); // going backwards from May 12
      const dt = d.toISOString().slice(0, 10);
      const stype = sessions[Math.floor(rand() * sessions.length)];
      const dist = +(4 + rand() * 12).toFixed(1);
      const dur = Math.round(40 + rand() * 60);
      const hr = Math.round(130 + rand() * 40);

      // Chandimal (pid=1): sharply rising ATL → ACWR danger zone
      let atl, ctl, acwr;
      if (pid === 1) {
        atl = +(650 + w * 45 + rand() * 30).toFixed(0);
        ctl = +(420 + w * 15 + rand() * 20).toFixed(0);
        acwr = +(atl / ctl).toFixed(2);
      } else if (pid === 5) {
        // Tharushi: perfectly managed load
        atl = +(380 + rand() * 40).toFixed(0);
        ctl = +(360 + rand() * 30).toFixed(0);
        acwr = +(atl / ctl).toFixed(2);
      } else if (pid === 22) {
        // Lalith Kumara: recovering from high load
        atl = +(500 - w * 20 + rand() * 30).toFixed(0);
        ctl = +(480 + rand() * 20).toFixed(0);
        acwr = +(atl / ctl).toFixed(2);
      } else {
        atl = +(300 + rand() * 200).toFixed(0);
        ctl = +(280 + rand() * 150).toFixed(0);
        acwr = +(atl / ctl).toFixed(2);
      }
      insLoad.run(pid, dt, stype, dist, dur, hr, atl, ctl, acwr);
    }
  }

  // Performance tests
  const insPerf = db.prepare('INSERT INTO performance_tests (participant_id,test_date,test_type,result,unit,conditions) VALUES (?,?,?,?,?,?)');
  const testDates = ['2024-12-15', '2025-02-20', '2025-04-25'];

  // Athlete-specific tests
  const perfDefs = {
    1: [['Batting Average', [38.2, 41.5, 44.1], 'runs', 'Indoor nets']],
    2: [['Batting Average', [31.5, 33.8, 36.2], 'runs', 'Indoor nets']],
    3: [['Batting Average', [28.1, 30.5, 33.2], 'runs', 'Match simulation']],
    5: [['100m Sprint', [12.82, 12.51, 12.18], 's', 'Track — still air']],     // rising star
    6: [['400m Run', [58.4, 57.1, 55.8], 's', 'Athletics track']],
    7: [['Long Jump', [6.82, 7.05, 7.22], 'm', 'Athletics track']],
    12: [['50m Freestyle', [25.8, 25.2, 24.7], 's', 'Olympic pool']],
    13: [['50m Backstroke', [32.5, 31.8, 31.1], 's', 'Olympic pool']],
    18: [['Bench Press 1RM', [120, 125, 130], 'kg', 'Gym']],
    19: [['Bench Press 1RM', [115, 118, 122], 'kg', 'Gym']],
    22: [['Punch Power', [680, 710, 725], 'N', 'Force plate']],
  };

  for (let pid = 1; pid <= 47; pid++) {
    const defs = perfDefs[pid];
    if (defs) {
      defs.forEach(([type, vals, unit, cond]) => {
        testDates.forEach((dt, i) => insPerf.run(pid, dt, type, vals[i], unit, cond));
      });
    } else {
      // Generic vertical jump for others
      const base = 45 + rand() * 25;
      testDates.forEach((dt, i) => {
        insPerf.run(pid, dt, 'Vertical Jump', +(base + i * (1 + rand() * 2)).toFixed(1), 'cm', 'Indoor court');
      });
    }
  }

  // Activity logs (8 entries per athlete over last 30 days)
  const insAct = db.prepare('INSERT INTO activity_logs (participant_id,log_date,activity_type,duration_mins,distance_km,steps,calories) VALUES (?,?,?,?,?,?,?)');
  const actTypes = ['Training Session','Match Play','Recovery Run','Gym Strength','Cross Training','Physiotherapy','Skills Practice'];
  for (let pid = 1; pid <= 47; pid++) {
    for (let i = 0; i < 8; i++) {
      const daysAgo = 3 + i * 4;
      const d = new Date(2025, 4, 12 - daysAgo);
      const dt = d.toISOString().slice(0, 10);
      const type = actTypes[Math.floor(rand() * actTypes.length)];
      const dur = Math.round(45 + rand() * 75);
      const dist = +(3 + rand() * 10).toFixed(1);
      const steps = Math.round(4000 + rand() * 8000);
      const cal = Math.round(250 + rand() * 500);
      insAct.run(pid, dt, type, dur, dist, steps, cal);
    }
  }

  console.log('✅ Database seeded successfully.');
}

// Run seed only if empty
const fedCount = db.prepare('SELECT COUNT(*) as c FROM federations').get();
if (fedCount.c === 0) seed();

// ─── EXPRESS APP ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: 'slsie-nocsl-2025', resave: false, saveUninitialized: false, cookie: { maxAge: 86400000 } }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Roles allowed to write data (ministry and donor are read-only)
const WRITE_ROLES = ['admin', 'federation', 'coach'];

function authWrite(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!WRITE_ROLES.includes(req.session.user.role))
    return res.status(403).json({ error: 'Your account is read-only. Contact NOCSL admin to request write access.' });
  next();
}

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=? AND password=?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = { id: user.id, name: user.name, role: user.role, initials: user.initials, federation_id: user.federation_id };
  res.json({ ok: true, user: req.session.user });
});
app.post('/api/auth/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const u = req.session.user;
  let fedName = null;
  if (u.federation_id) {
    const fed = db.prepare('SELECT name FROM federations WHERE id=?').get(u.federation_id);
    fedName = fed ? fed.name : null;
  }
  res.json({ ...u, federation_name: fedName });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  const totalFeds = db.prepare('SELECT COUNT(*) as c FROM federations').get().c;
  const submitted = db.prepare('SELECT COUNT(DISTINCT federation_id) as c FROM governance_scores WHERE year=2025').get().c;
  const avgScore = db.prepare('SELECT ROUND(AVG(total_score),2) as avg FROM governance_scores WHERE year=2025').get().avg;
  const totalAthletes = db.prepare('SELECT SUM(athletes_count) as s FROM federations').get().s;

  const dist = { green: 0, amber: 0, red: 0 };
  db.prepare('SELECT total_score FROM governance_scores WHERE year=2025').all().forEach(r => {
    if (r.total_score >= 4.0) dist.green++;
    else if (r.total_score >= 3.0) dist.amber++;
    else dist.red++;
  });

  // Recent submissions (top 5)
  const recent = db.prepare(`
    SELECT f.name, f.sport, g.total_score, g.submitted_at
    FROM governance_scores g JOIN federations f ON f.id=g.federation_id
    WHERE g.year=2025 ORDER BY g.id DESC LIMIT 5`).all();

  // Top 10 federations by score
  const topFeds = db.prepare(`
    SELECT f.name, f.sport, f.color, g.total_score
    FROM governance_scores g JOIN federations f ON f.id=g.federation_id
    WHERE g.year=2025 ORDER BY g.total_score DESC LIMIT 10`).all();

  // Avg score by year
  const trend = db.prepare('SELECT year, ROUND(AVG(total_score),2) as avg FROM governance_scores GROUP BY year ORDER BY year').all();

  // Province participation count
  const provinceStats = db.prepare('SELECT province, COUNT(*) as c FROM participants GROUP BY province ORDER BY c DESC').all();

  res.json({ totalFeds, submitted, pending: totalFeds - submitted, avgScore, totalAthletes, dist, recent, topFeds, trend, provinceStats });
});

// ─── FEDERATIONS ─────────────────────────────────────────────────────────────
app.get('/api/federations', auth, (req, res) => {
  const u = req.session.user;
  const scopedToOwn = (u.role === 'federation' || u.role === 'coach') && u.federation_id;
  const base = `
    SELECT f.*, g.total_score, g.status as gov_status,
           g.board_composition, g.director_skills, g.strategic_planning,
           g.financial_transparency, g.integrity_risk, g.stakeholder_engagement,
           g.regulatory_compliance, g.culture_score
    FROM federations f
    LEFT JOIN governance_scores g ON g.federation_id=f.id AND g.year=2025`;
  const rows = scopedToOwn
    ? db.prepare(base + ' WHERE f.id=? ORDER BY COALESCE(g.total_score,-1) DESC').all(u.federation_id)
    : db.prepare(base + ' ORDER BY COALESCE(g.total_score,-1) DESC').all();
  res.json(rows);
});

app.get('/api/federations/:id', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM federations WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  const scores = db.prepare('SELECT * FROM governance_scores WHERE federation_id=? ORDER BY year DESC').all(req.params.id);
  const athletes = db.prepare("SELECT id,name,gender,birth_year,province,sport,status FROM participants WHERE federation_id=? AND participant_type='athlete'").all(req.params.id);
  res.json({ ...f, scores, athletes });
});

// ─── GOVERNANCE BENCHMARK ─────────────────────────────────────────────────────
app.get('/api/governance/benchmark', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.name, f.sport, f.color,
           g.board_composition, g.director_skills, g.strategic_planning,
           g.financial_transparency, g.integrity_risk, g.stakeholder_engagement,
           g.regulatory_compliance, g.culture_score, g.total_score
    FROM governance_scores g JOIN federations f ON f.id=g.federation_id
    WHERE g.year=2025 ORDER BY g.total_score DESC`).all();
  const pending = db.prepare(`
    SELECT id, name, sport FROM federations
    WHERE id NOT IN (SELECT federation_id FROM governance_scores WHERE year=2025)`).all();
  res.json({ submitted: rows, pending });
});

// ─── ATHLETES ────────────────────────────────────────────────────────────────
app.get('/api/athletes', auth, (req, res) => {
  const u = req.session.user;
  const scopedToOwn = (u.role === 'federation' || u.role === 'coach') && u.federation_id;
  const base = `
    SELECT p.*, f.name as federation_name, f.color,
      ROUND(julianday('now') - julianday(birth_year||'-01-01')) / 365.25 as age,
      (SELECT acwr FROM training_loads WHERE participant_id=p.id ORDER BY load_date DESC LIMIT 1) as latest_acwr,
      (SELECT weight_kg FROM biometric_records WHERE participant_id=p.id ORDER BY record_date DESC LIMIT 1) as latest_weight,
      (SELECT bmi FROM biometric_records WHERE participant_id=p.id ORDER BY record_date DESC LIMIT 1) as latest_bmi
    FROM participants p
    LEFT JOIN federations f ON f.id=p.federation_id`;
  const rows = scopedToOwn
    ? db.prepare(base + ' WHERE p.federation_id=? ORDER BY p.name').all(u.federation_id)
    : db.prepare(base + ' ORDER BY f.name, p.name').all();
  res.json(rows);
});

app.get('/api/athletes/:id', auth, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, f.name as federation_name, f.color,
      ROUND(2025 - birth_year) as age
    FROM participants p LEFT JOIN federations f ON f.id=p.federation_id
    WHERE p.id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });

  const latestBio = db.prepare('SELECT * FROM biometric_records WHERE participant_id=? ORDER BY record_date DESC LIMIT 1').get(req.params.id);
  const latestLoad = db.prepare('SELECT * FROM training_loads WHERE participant_id=? ORDER BY load_date DESC LIMIT 1').get(req.params.id);
  const recentActivity = db.prepare('SELECT * FROM activity_logs WHERE participant_id=? ORDER BY log_date DESC LIMIT 5').all(req.params.id);
  const recentTests = db.prepare('SELECT * FROM performance_tests WHERE participant_id=? ORDER BY test_date DESC LIMIT 5').all(req.params.id);

  res.json({ ...p, latestBio, latestLoad, recentActivity, recentTests });
});

app.get('/api/athletes/:id/biometrics', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM biometric_records WHERE participant_id=? ORDER BY record_date').all(req.params.id);
  res.json(rows);
});

app.get('/api/athletes/:id/training', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM training_loads WHERE participant_id=? ORDER BY load_date').all(req.params.id);
  res.json(rows);
});

app.get('/api/athletes/:id/performance', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM performance_tests WHERE participant_id=? ORDER BY test_date').all(req.params.id);
  res.json(rows);
});

// ─── FIT FOR LIFE ────────────────────────────────────────────────────────────
app.get('/api/fitforlife', auth, (req, res) => {
  const totalParticipants = db.prepare('SELECT COUNT(*) as c FROM participants').get().c;
  const byProvince = db.prepare('SELECT province, COUNT(*) as c FROM participants GROUP BY province ORDER BY c DESC').all();
  const byGender = db.prepare('SELECT gender, COUNT(*) as c FROM participants GROUP BY gender').all();
  const bySport = db.prepare('SELECT sport, COUNT(*) as c FROM participants GROUP BY sport ORDER BY c DESC LIMIT 8').all();
  const avgBmi = db.prepare('SELECT ROUND(AVG(bmi),1) as avg FROM biometric_records WHERE record_date=(SELECT MAX(record_date) FROM biometric_records)').get().avg;
  const avgSleep = db.prepare('SELECT ROUND(AVG(sleep_quality),1) as avg FROM biometric_records WHERE record_date=(SELECT MAX(record_date) FROM biometric_records)').get().avg;
  const avgMental = db.prepare('SELECT ROUND(AVG(mental_wellbeing),1) as avg FROM biometric_records WHERE record_date=(SELECT MAX(record_date) FROM biometric_records)').get().avg;
  const activityTotals = db.prepare('SELECT activity_type, COUNT(*) as c, SUM(calories) as cal FROM activity_logs GROUP BY activity_type ORDER BY c DESC').all();
  const highRisk = db.prepare(`SELECT p.name, p.sport, f.name as fed, t.acwr
    FROM training_loads t JOIN participants p ON p.id=t.participant_id
    JOIN federations f ON f.id=p.federation_id
    WHERE t.load_date=(SELECT MAX(load_date) FROM training_loads WHERE participant_id=t.participant_id)
    AND t.acwr > 1.4 ORDER BY t.acwr DESC`).all();

  res.json({ totalParticipants, byProvince, byGender, bySport, avgBmi, avgSleep, avgMental, activityTotals, highRisk });
});

// ─── WRITE API ────────────────────────────────────────────────────────────────

// Federation list for dropdowns
app.get('/api/federations-list', auth, (req, res) => {
  res.json(db.prepare('SELECT id, name, sport FROM federations ORDER BY name').all());
});

// Update federation details
app.put('/api/federations/:id', auth, authWrite, (req, res) => {
  const u = req.session.user;
  if (u.role === 'coach') return res.status(403).json({ error: 'Coaches cannot edit federation details.' });
  if (u.role === 'federation' && u.federation_id !== Number(req.params.id))
    return res.status(403).json({ error: 'You can only edit your own federation.' });
  const { president, secretary, total_members, athletes_count, province, established_year } = req.body;
  db.prepare('UPDATE federations SET president=?,secretary=?,total_members=?,athletes_count=?,province=?,established_year=? WHERE id=?')
    .run(president, secretary, Number(total_members)||0, Number(athletes_count)||0, province, Number(established_year)||0, req.params.id);
  res.json({ ok: true });
});

// Submit / update governance scores (upsert)
app.post('/api/governance', auth, authWrite, (req, res) => {
  const u = req.session.user;
  if (u.role === 'coach') return res.status(403).json({ error: 'Coaches cannot submit governance scores.' });
  const { federation_id, year, board_composition, director_skills, strategic_planning,
          financial_transparency, integrity_risk, stakeholder_engagement,
          regulatory_compliance, culture_score } = req.body;
  if (u.role === 'federation' && u.federation_id !== Number(federation_id))
    return res.status(403).json({ error: 'You can only submit scores for your own federation.' });
  const scores = [board_composition, director_skills, strategic_planning,
    financial_transparency, integrity_risk, stakeholder_engagement,
    regulatory_compliance, culture_score].map(Number);
  const total = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
  db.prepare(`
    INSERT INTO governance_scores
      (federation_id,year,board_composition,director_skills,strategic_planning,
       financial_transparency,integrity_risk,stakeholder_engagement,
       regulatory_compliance,culture_score,total_score,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'submitted')
    ON CONFLICT(federation_id,year) DO UPDATE SET
      board_composition=excluded.board_composition, director_skills=excluded.director_skills,
      strategic_planning=excluded.strategic_planning, financial_transparency=excluded.financial_transparency,
      integrity_risk=excluded.integrity_risk, stakeholder_engagement=excluded.stakeholder_engagement,
      regulatory_compliance=excluded.regulatory_compliance, culture_score=excluded.culture_score,
      total_score=excluded.total_score, status='submitted', submitted_at=CURRENT_TIMESTAMP`)
    .run(Number(federation_id), Number(year), ...scores, total);
  res.json({ ok: true, total });
});

// Register new athlete
app.post('/api/athletes', auth, authWrite, (req, res) => {
  const { name, gender, birth_year, province, school, federation_id, sport } = req.body;
  const r = db.prepare('INSERT INTO participants (name,gender,birth_year,province,school,federation_id,sport,participant_type,status) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(name, gender, Number(birth_year), province, school || '', Number(federation_id), sport, 'athlete', 'active');
  res.json({ ok: true, id: r.lastInsertRowid });
});

// Update athlete profile
app.put('/api/athletes/:id', auth, authWrite, (req, res) => {
  const { name, gender, birth_year, province, school, sport } = req.body;
  db.prepare('UPDATE participants SET name=?,gender=?,birth_year=?,province=?,school=?,sport=? WHERE id=?')
    .run(name, gender, Number(birth_year), province, school || '', sport, req.params.id);
  res.json({ ok: true });
});

// Add biometric record
app.post('/api/athletes/:id/biometrics', auth, authWrite, (req, res) => {
  const { record_date, height_cm, weight_kg, body_fat_pct, heart_rate,
          bp_systolic, bp_diastolic, sleep_quality, stress_level, mental_wellbeing, soreness } = req.body;
  const h = Number(height_cm); const w = Number(weight_kg);
  const bmi = h && w ? +(w / ((h / 100) ** 2)).toFixed(1) : null;
  db.prepare(`INSERT INTO biometric_records
    (participant_id,record_date,height_cm,weight_kg,bmi,body_fat_pct,heart_rate,
     bp_systolic,bp_diastolic,sleep_quality,stress_level,mental_wellbeing,soreness)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.params.id, record_date, h, w, bmi,
         body_fat_pct ? Number(body_fat_pct) : null,
         Number(heart_rate), Number(bp_systolic), Number(bp_diastolic),
         Number(sleep_quality), Number(stress_level), Number(mental_wellbeing), Number(soreness));
  res.json({ ok: true, bmi });
});

// Add training load entry
app.post('/api/athletes/:id/training', auth, authWrite, (req, res) => {
  const { load_date, session_type, distance_km, duration_mins, heart_rate, acute_load, chronic_load } = req.body;
  const atl = Number(acute_load); const ctl = Number(chronic_load);
  const acwr = atl && ctl ? +(atl / ctl).toFixed(2) : null;
  db.prepare('INSERT INTO training_loads (participant_id,load_date,session_type,distance_km,duration_mins,heart_rate,acute_load,chronic_load,acwr) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.params.id, load_date, session_type, Number(distance_km) || 0, Number(duration_mins) || 0,
         Number(heart_rate) || 0, atl, ctl, acwr);
  res.json({ ok: true, acwr });
});

// Add performance test result
app.post('/api/athletes/:id/performance', auth, authWrite, (req, res) => {
  const { test_date, test_type, result, unit, conditions } = req.body;
  db.prepare('INSERT INTO performance_tests (participant_id,test_date,test_type,result,unit,conditions) VALUES (?,?,?,?,?,?)')
    .run(req.params.id, test_date, test_type, Number(result), unit || '', conditions || '');
  res.json({ ok: true });
});

// Add activity log entry
app.post('/api/athletes/:id/activity', auth, authWrite, (req, res) => {
  const { log_date, activity_type, duration_mins, distance_km, calories } = req.body;
  db.prepare('INSERT INTO activity_logs (participant_id,log_date,activity_type,duration_mins,distance_km,calories) VALUES (?,?,?,?,?,?)')
    .run(req.params.id, log_date, activity_type, Number(duration_mins) || 0,
         Number(distance_km) || 0, Number(calories) || 0);
  res.json({ ok: true });
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────

function getReportData(type) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  switch (type) {
    case 'governance': {
      const scores = db.prepare(`SELECT f.name, f.sport, g.total_score, g.board_composition,
        g.director_skills, g.strategic_planning, g.financial_transparency,
        g.integrity_risk, g.stakeholder_engagement, g.regulatory_compliance, g.culture_score
        FROM governance_scores g JOIN federations f ON f.id=g.federation_id
        WHERE g.year=2025 ORDER BY g.total_score DESC`).all();
      const pending = db.prepare(`SELECT name, sport FROM federations WHERE id NOT IN
        (SELECT federation_id FROM governance_scores WHERE year=2025) ORDER BY name`).all();
      const avgScore = db.prepare('SELECT ROUND(AVG(total_score),2) as avg FROM governance_scores WHERE year=2025').get().avg;
      const green = scores.filter(s => s.total_score >= 4.0).length;
      const amber = scores.filter(s => s.total_score >= 3.0 && s.total_score < 4.0).length;
      const red = scores.filter(s => s.total_score < 3.0).length;
      return { today, scores, pending, avgScore, green, amber, red };
    }
    case 'fitforlife': {
      const totalParticipants = db.prepare('SELECT COUNT(*) as c FROM participants').get().c;
      const byProvince = db.prepare('SELECT province, COUNT(*) as c FROM participants GROUP BY province ORDER BY c DESC').all();
      const byGender = db.prepare("SELECT gender, COUNT(*) as c FROM participants GROUP BY gender ORDER BY gender").all();
      const bySport = db.prepare('SELECT sport, COUNT(*) as c FROM participants GROUP BY sport ORDER BY c DESC LIMIT 10').all();
      const latest = db.prepare('SELECT MAX(record_date) as d FROM biometric_records').get().d;
      const avgBmi    = db.prepare('SELECT ROUND(AVG(bmi),1) as v FROM biometric_records WHERE record_date=?').get(latest).v;
      const avgSleep  = db.prepare('SELECT ROUND(AVG(sleep_quality),1) as v FROM biometric_records WHERE record_date=?').get(latest).v;
      const avgMental = db.prepare('SELECT ROUND(AVG(mental_wellbeing),1) as v FROM biometric_records WHERE record_date=?').get(latest).v;
      const avgStress = db.prepare('SELECT ROUND(AVG(stress_level),1) as v FROM biometric_records WHERE record_date=?').get(latest).v;
      const actStats  = db.prepare('SELECT COUNT(*) as sessions, ROUND(SUM(duration_mins)/60.0,0) as hours, SUM(calories) as cal FROM activity_logs').get();
      return { today, totalParticipants, byProvince, byGender, bySport, avgBmi, avgSleep, avgMental, avgStress, actStats };
    }
    case 'injury-risk': {
      const highRisk = db.prepare(`SELECT p.name, p.sport, f.name as federation, t.acwr, t.acute_load, t.chronic_load, t.load_date
        FROM training_loads t JOIN participants p ON p.id=t.participant_id
        JOIN federations f ON f.id=p.federation_id
        WHERE t.load_date=(SELECT MAX(load_date) FROM training_loads WHERE participant_id=t.participant_id)
        AND t.acwr > 1.5 ORDER BY t.acwr DESC`).all();
      const cautionRisk = db.prepare(`SELECT p.name, p.sport, f.name as federation, t.acwr
        FROM training_loads t JOIN participants p ON p.id=t.participant_id
        JOIN federations f ON f.id=p.federation_id
        WHERE t.load_date=(SELECT MAX(load_date) FROM training_loads WHERE participant_id=t.participant_id)
        AND t.acwr BETWEEN 1.3 AND 1.5 ORDER BY t.acwr DESC`).all();
      const totalAth = db.prepare('SELECT COUNT(DISTINCT participant_id) as c FROM training_loads').get().c;
      return { today, highRisk, cautionRisk, totalAth };
    }
    case 'performance': {
      const athletes = db.prepare(`SELECT p.id, p.name, p.sport, p.birth_year, f.name as federation
        FROM participants p JOIN federations f ON f.id=p.federation_id
        WHERE p.federation_id=2 ORDER BY p.name`).all();
      const tests = db.prepare(`SELECT p.name, pt.test_type, pt.test_date, pt.result, pt.unit
        FROM performance_tests pt JOIN participants p ON p.id=pt.participant_id
        WHERE p.federation_id=2 ORDER BY p.name, pt.test_type, pt.test_date`).all();
      return { today, athletes, tests };
    }
    case 'compliance': {
      const federations = db.prepare(`SELECT f.name, f.sport, f.established_year, f.province, f.total_members,
        COALESCE(g.total_score, NULL) as total_score,
        COALESCE(g.regulatory_compliance, NULL) as reg_comp,
        CASE WHEN g.total_score IS NULL THEN 'Pending' WHEN g.total_score >= 3.0 THEN 'Compliant' ELSE 'Non-Compliant' END as status
        FROM federations f LEFT JOIN governance_scores g ON g.federation_id=f.id AND g.year=2025
        ORDER BY status, g.total_score DESC`).all();
      const compliant = federations.filter(f => f.status === 'Compliant').length;
      const nonCompliant = federations.filter(f => f.status === 'Non-Compliant').length;
      const pending = federations.filter(f => f.status === 'Pending').length;
      return { today, federations, compliant, nonCompliant, pending };
    }
    case 'donor': {
      const totalAthletes = db.prepare('SELECT COUNT(*) as c FROM participants').get().c;
      const byProvince = db.prepare('SELECT province, COUNT(*) as c FROM participants GROUP BY province ORDER BY c DESC').all();
      const actStats = db.prepare('SELECT COUNT(*) as sessions, ROUND(SUM(duration_mins)/60.0,0) as hours, ROUND(SUM(calories)/1000.0,1) as kcal FROM activity_logs').get();
      const topSports = db.prepare('SELECT sport, COUNT(*) as c FROM participants GROUP BY sport ORDER BY c DESC LIMIT 6').all();
      const latest = db.prepare('SELECT MAX(record_date) as d FROM biometric_records').get().d;
      const health = db.prepare('SELECT ROUND(AVG(bmi),1) as avg_bmi, ROUND(AVG(mental_wellbeing),1) as avg_mental, ROUND(AVG(sleep_quality),1) as avg_sleep FROM biometric_records WHERE record_date=?').get(latest);
      const govStats = db.prepare('SELECT COUNT(*) as submitted, ROUND(AVG(total_score),2) as avg FROM governance_scores WHERE year=2025').get();
      return { today, totalAthletes, byProvince, actStats, topSports, health, govStats };
    }
    default: return { today };
  }
}

const REPORT_TITLES = {
  governance:   'Governance Benchmarking Report 2025',
  fitforlife:   'Fit for Life Programme Report — May 2025',
  'injury-risk':'AI Injury Risk Alert Report',
  performance:  'Performance Trend Analysis — Athletics',
  compliance:   'Federation Compliance Report',
  donor:        'Donor Impact Report — Q1 2025',
};

function reportHtmlPage(titleStr, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>${titleStr}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#222;background:#fff}
.cover{background:linear-gradient(135deg,#1F4E79,#2E75B6);color:#fff;padding:56px 50px 40px;page-break-after:always}
.cover-org{font-size:8.5pt;opacity:.75;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px}
.cover-title{font-size:22pt;font-weight:800;line-height:1.2;margin-bottom:8px}
.cover-sub{font-size:11pt;opacity:.85;margin-bottom:24px}
.cover-meta{font-size:8.5pt;opacity:.65;border-top:1px solid rgba(255,255,255,.3);padding-top:12px}
.wrap{padding:30px 44px 44px;max-width:960px;margin:0 auto}
h2{font-size:13pt;color:#1F4E79;font-weight:700;margin:28px 0 12px;padding-bottom:6px;border-bottom:2.5px solid #1F4E79}
h3{font-size:10.5pt;color:#2E75B6;font-weight:700;margin:18px 0 8px}
p{line-height:1.6;margin-bottom:10px;color:#444}
.kpi-row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.kpi{flex:1;min-width:110px;background:#f0f6ff;border:1px solid #dbeafe;border-radius:8px;padding:14px 10px;text-align:center}
.kpi .v{font-size:20pt;font-weight:800;color:#1F4E79;line-height:1}
.kpi .l{font-size:8pt;color:#555;margin-top:5px;line-height:1.3}
.kpi.green{background:#dcfce7;border-color:#bbf7d0}.kpi.green .v{color:#15803d}
.kpi.amber{background:#fef3c7;border-color:#fde68a}.kpi.amber .v{color:#b45309}
.kpi.red{background:#fee2e2;border-color:#fecaca}.kpi.red .v{color:#b91c1c}
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9.5pt}
thead th{background:#1F4E79;color:#fff;padding:8px 10px;text-align:left;font-weight:600;font-size:8.5pt}
tbody td{border:1px solid #e2e8f0;padding:7px 10px;vertical-align:middle}
tbody tr:nth-child(even) td{background:#f8faff}
.badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:8pt;font-weight:700}
.g{background:#dcfce7;color:#15803d}.a{background:#fef3c7;color:#b45309}
.r{background:#fee2e2;color:#b91c1c}.gr{background:#f1f5f9;color:#475569}
.note{background:#eff6ff;border-left:4px solid #3b82f6;padding:10px 14px;font-size:9pt;margin:12px 0;border-radius:0 6px 6px 0}
.footer{margin-top:48px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:8pt;color:#94a3b8;display:flex;justify-content:space-between}
@media print{@page{margin:1.2cm 1.5cm}body{font-size:10pt}}
</style>
<script>window.onload=()=>setTimeout(()=>window.print(),600);</script>
</head><body>${bodyHtml}</body></html>`;
}

function generateHtmlReport(type, data) {
  const title = REPORT_TITLES[type] || 'Report';
  let body = '';

  if (type === 'governance') {
    const { today, scores, pending, avgScore, green, amber, red } = data;
    const badge = s => `<span class="badge ${s>=4?'g':s>=3?'a':'r'}">${s>=4?'Green':s>=3?'Amber':'Red'}</span>`;
    body = `
<div class="cover">
  <div class="cover-org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
  <div class="cover-title">${title}</div>
  <div class="cover-sub">Sector-wide governance performance of Sri Lanka's 34 national sports federations</div>
  <div class="cover-meta">Generated: ${today} &nbsp;|&nbsp; Reporting Period: January – May 2025 &nbsp;|&nbsp; Classification: Restricted</div>
</div>
<div class="wrap">
  <h2>Executive Summary</h2>
  <p>This report presents the governance benchmark scores for all National Sports Federations (NSFs) affiliated to the National Olympic Committee of Sri Lanka (NOCSL) for the 2025 reporting cycle. Scores are assessed across eight dimensions: Board Composition, Director Skills, Strategic Planning, Financial Transparency, Integrity &amp; Risk, Stakeholder Engagement, Regulatory Compliance, and Organisational Culture.</p>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${scores.length + pending.length}</div><div class="l">Member Federations</div></div>
    <div class="kpi"><div class="v">${scores.length}</div><div class="l">Reports Submitted</div></div>
    <div class="kpi"><div class="v">${pending.length}</div><div class="l">Pending Submission</div></div>
    <div class="kpi"><div class="v">${avgScore}</div><div class="l">Avg Score / 5.0</div></div>
    <div class="kpi green"><div class="v">${green}</div><div class="l">Green ≥ 4.0</div></div>
    <div class="kpi amber"><div class="v">${amber}</div><div class="l">Amber 3.0–3.9</div></div>
    <div class="kpi red"><div class="v">${red}</div><div class="l">Red &lt; 3.0</div></div>
  </div>
  <h2>Federation Rankings — 2025</h2>
  <table>
    <thead><tr><th>#</th><th>Federation</th><th>Sport</th><th>Total</th><th>Board</th><th>Skills</th><th>Strategy</th><th>Finance</th><th>Integrity</th><th>Compliance</th><th>Culture</th><th>Status</th></tr></thead>
    <tbody>${scores.map((s, i) => `<tr>
      <td>${i+1}</td><td>${s.name}</td><td>${s.sport}</td>
      <td><strong>${s.total_score.toFixed(2)}</strong></td>
      <td>${s.board_composition.toFixed(1)}</td><td>${s.director_skills.toFixed(1)}</td>
      <td>${s.strategic_planning.toFixed(1)}</td><td>${s.financial_transparency.toFixed(1)}</td>
      <td>${s.integrity_risk.toFixed(1)}</td><td>${s.regulatory_compliance.toFixed(1)}</td>
      <td>${s.culture_score.toFixed(1)}</td><td>${badge(s.total_score)}</td>
    </tr>`).join('')}</tbody>
  </table>
  ${pending.length ? `
  <h2>Pending Submissions (${pending.length})</h2>
  <table>
    <thead><tr><th>Federation</th><th>Sport</th><th>Status</th></tr></thead>
    <tbody>${pending.map(p=>`<tr><td>${p.name}</td><td>${p.sport}</td><td><span class="badge gr">Awaiting Submission</span></td></tr>`).join('')}</tbody>
  </table>` : ''}
  <div class="footer"><span>SLSIE — Sri Lanka Sports Intelligence Ecosystem</span><span>Confidential · For NOCSL Internal Use Only</span><span>© 2025 Everpower Software Solutions</span></div>
</div>`;
  }

  else if (type === 'fitforlife') {
    const { today, totalParticipants, byProvince, byGender, bySport, avgBmi, avgSleep, avgMental, avgStress, actStats } = data;
    body = `
<div class="cover">
  <div class="cover-org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
  <div class="cover-title">${title}</div>
  <div class="cover-sub">National athlete health, wellness, and physical activity programme outcomes</div>
  <div class="cover-meta">Generated: ${today} &nbsp;|&nbsp; Reporting Period: May 2025 &nbsp;|&nbsp; Classification: Restricted</div>
</div>
<div class="wrap">
  <h2>Programme Overview</h2>
  <p>The Fit for Life programme tracks biometric, wellness, and activity data for athletes registered across NOCSL-affiliated federations. This report summarises participation, health indicators, and activity engagement for May 2025.</p>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${totalParticipants}</div><div class="l">Registered Athletes</div></div>
    <div class="kpi"><div class="v">${avgBmi}</div><div class="l">Avg BMI</div></div>
    <div class="kpi green"><div class="v">${avgMental}/10</div><div class="l">Avg Mental Wellbeing</div></div>
    <div class="kpi"><div class="v">${avgSleep}/10</div><div class="l">Avg Sleep Quality</div></div>
    <div class="kpi amber"><div class="v">${avgStress}/10</div><div class="l">Avg Stress Level</div></div>
    <div class="kpi"><div class="v">${actStats.sessions}</div><div class="l">Activity Sessions</div></div>
    <div class="kpi"><div class="v">${actStats.hours}h</div><div class="l">Training Hours Logged</div></div>
  </div>
  <h2>Participation by Province</h2>
  <table>
    <thead><tr><th>Province</th><th>Athletes</th><th>Share (%)</th></tr></thead>
    <tbody>${byProvince.map(p=>`<tr><td>${p.province}</td><td>${p.c}</td><td>${((p.c/totalParticipants)*100).toFixed(1)}%</td></tr>`).join('')}</tbody>
  </table>
  <h2>Gender Distribution</h2>
  <table>
    <thead><tr><th>Gender</th><th>Count</th><th>Share (%)</th></tr></thead>
    <tbody>${byGender.map(g=>`<tr><td>${g.gender==='M'?'Male':'Female'}</td><td>${g.c}</td><td>${((g.c/totalParticipants)*100).toFixed(1)}%</td></tr>`).join('')}</tbody>
  </table>
  <h2>Top Sports by Participation</h2>
  <table>
    <thead><tr><th>Sport</th><th>Athletes</th></tr></thead>
    <tbody>${bySport.map(s=>`<tr><td>${s.sport}</td><td>${s.c}</td></tr>`).join('')}</tbody>
  </table>
  <div class="note"><strong>Programme Note:</strong> All data collected via the SLSIE athlete management platform. Biometric data is self-reported by federation coaches and verified by the NOCSL Sports Science Unit.</div>
  <div class="footer"><span>SLSIE — Sri Lanka Sports Intelligence Ecosystem</span><span>Confidential · For NOCSL &amp; Donor Use</span><span>© 2025 Everpower Software Solutions</span></div>
</div>`;
  }

  else if (type === 'injury-risk') {
    const { today, highRisk, cautionRisk, totalAth } = data;
    body = `
<div class="cover">
  <div class="cover-org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
  <div class="cover-title">${title}</div>
  <div class="cover-sub">AI-generated training load analysis — athletes at elevated injury risk</div>
  <div class="cover-meta">Generated: ${today} &nbsp;|&nbsp; Alert Period: Week ending 12 May 2025 &nbsp;|&nbsp; Classification: Restricted — Coaching Staff Only</div>
</div>
<div class="wrap">
  <h2>Risk Summary</h2>
  <p>Acute:Chronic Workload Ratio (ACWR) is used to identify athletes whose recent training load significantly exceeds their chronic baseline. An ACWR above 1.5 indicates HIGH RISK of injury. Athletes between 1.3–1.5 are flagged for CAUTION.</p>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${totalAth}</div><div class="l">Athletes Monitored</div></div>
    <div class="kpi red"><div class="v">${highRisk.length}</div><div class="l">High Risk (ACWR > 1.5)</div></div>
    <div class="kpi amber"><div class="v">${cautionRisk.length}</div><div class="l">Caution (ACWR 1.3–1.5)</div></div>
    <div class="kpi green"><div class="v">${totalAth - highRisk.length - cautionRisk.length}</div><div class="l">Optimal / Safe</div></div>
  </div>
  ${highRisk.length ? `
  <h2>🔴 High Risk Athletes (ACWR > 1.5)</h2>
  <div class="note"><strong>Action Required:</strong> Consider load reduction, mandatory rest day, or physiotherapy review for all athletes listed below.</div>
  <table>
    <thead><tr><th>Athlete</th><th>Sport</th><th>Federation</th><th>ACWR</th><th>Acute Load</th><th>Chronic Load</th><th>Last Recorded</th></tr></thead>
    <tbody>${highRisk.map(a=>`<tr>
      <td><strong>${a.name}</strong></td><td>${a.sport}</td><td>${a.federation}</td>
      <td><strong style="color:#b91c1c">${a.acwr.toFixed(2)}</strong></td>
      <td>${a.acute_load}</td><td>${a.chronic_load}</td><td>${a.load_date}</td>
    </tr>`).join('')}</tbody>
  </table>` : `<h2>🔴 High Risk Athletes</h2><p>No athletes currently in the high-risk zone.</p>`}
  ${cautionRisk.length ? `
  <h2>⚡ Caution Zone Athletes (ACWR 1.3–1.5)</h2>
  <table>
    <thead><tr><th>Athlete</th><th>Sport</th><th>Federation</th><th>ACWR</th></tr></thead>
    <tbody>${cautionRisk.map(a=>`<tr><td>${a.name}</td><td>${a.sport}</td><td>${a.federation}</td><td><strong style="color:#b45309">${a.acwr.toFixed(2)}</strong></td></tr>`).join('')}</tbody>
  </table>` : ''}
  <div class="note"><strong>Methodology:</strong> ACWR is calculated as Acute Training Load (7-day rolling average) divided by Chronic Training Load (28-day rolling average). Source: SLSIE Training Load Module.</div>
  <div class="footer"><span>SLSIE — Sri Lanka Sports Intelligence Ecosystem</span><span>Confidential · For Coaching Staff Only</span><span>© 2025 Everpower Software Solutions</span></div>
</div>`;
  }

  else if (type === 'performance') {
    const { today, athletes, tests } = data;
    const byAthlete = {};
    tests.forEach(t => { if (!byAthlete[t.name]) byAthlete[t.name] = []; byAthlete[t.name].push(t); });
    body = `
<div class="cover">
  <div class="cover-org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
  <div class="cover-title">${title}</div>
  <div class="cover-sub">Longitudinal performance test results for Athletics Sri Lanka athletes</div>
  <div class="cover-meta">Generated: ${today} &nbsp;|&nbsp; Test Period: Dec 2024 – Apr 2025 &nbsp;|&nbsp; Classification: Restricted</div>
</div>
<div class="wrap">
  <h2>Federation Profile — Athletics Sri Lanka</h2>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${athletes.length}</div><div class="l">Registered Athletes</div></div>
    <div class="kpi"><div class="v">3</div><div class="l">Test Cycles</div></div>
    <div class="kpi"><div class="v">${tests.length}</div><div class="l">Total Test Records</div></div>
  </div>
  <h2>Athlete Roster</h2>
  <table>
    <thead><tr><th>Athlete</th><th>Birth Year</th><th>Province</th><th>Tests Recorded</th></tr></thead>
    <tbody>${athletes.map(a=>`<tr><td><strong>${a.name}</strong></td><td>${a.birth_year}</td><td>${a.province||'—'}</td><td>${byAthlete[a.name]?byAthlete[a.name].length:0}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Performance Test Results</h2>
  ${Object.entries(byAthlete).map(([name, ts]) => `
    <h3>${name}</h3>
    <table>
      <thead><tr><th>Test Type</th><th>Date</th><th>Result</th><th>Unit</th></tr></thead>
      <tbody>${ts.map(t=>`<tr><td>${t.test_type}</td><td>${t.test_date}</td><td><strong>${t.result}</strong></td><td>${t.unit}</td></tr>`).join('')}</tbody>
    </table>`).join('')}
  <div class="footer"><span>SLSIE — Sri Lanka Sports Intelligence Ecosystem</span><span>Confidential · For NOCSL Sports Science Unit</span><span>© 2025 Everpower Software Solutions</span></div>
</div>`;
  }

  else if (type === 'compliance') {
    const { today, federations, compliant, nonCompliant, pending } = data;
    const badge = s => `<span class="badge ${s==='Compliant'?'g':s==='Non-Compliant'?'r':'gr'}">${s}</span>`;
    body = `
<div class="cover">
  <div class="cover-org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
  <div class="cover-title">${title}</div>
  <div class="cover-sub">Regulatory compliance status against National Sports Associations Regulations No. 01 of 2025</div>
  <div class="cover-meta">Generated: ${today} &nbsp;|&nbsp; Reporting Year: 2025 &nbsp;|&nbsp; Classification: Official Use Only</div>
</div>
<div class="wrap">
  <h2>Compliance Overview</h2>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${federations.length}</div><div class="l">Total Federations</div></div>
    <div class="kpi green"><div class="v">${compliant}</div><div class="l">Compliant</div></div>
    <div class="kpi red"><div class="v">${nonCompliant}</div><div class="l">Non-Compliant</div></div>
    <div class="kpi amber"><div class="v">${pending}</div><div class="l">Pending Review</div></div>
  </div>
  <h2>Federation Compliance Status</h2>
  <table>
    <thead><tr><th>Federation</th><th>Sport</th><th>Est.</th><th>Province</th><th>Members</th><th>Gov. Score</th><th>Reg. Compliance</th><th>Status</th></tr></thead>
    <tbody>${federations.map(f=>`<tr>
      <td>${f.name}</td><td>${f.sport}</td><td>${f.established_year}</td><td>${f.province}</td><td>${f.total_members.toLocaleString()}</td>
      <td>${f.total_score ? f.total_score.toFixed(2) : '—'}</td>
      <td>${f.reg_comp ? f.reg_comp.toFixed(1) : '—'}</td>
      <td>${badge(f.status)}</td>
    </tr>`).join('')}</tbody>
  </table>
  <div class="note"><strong>Compliance Criterion:</strong> A federation is deemed compliant if its Governance Benchmarking total score is ≥ 3.0 / 5.0 as per NOCSL Circular 2025-04. Pending status indicates that the federation has not yet submitted its 2025 governance assessment.</div>
  <div class="footer"><span>SLSIE — Sri Lanka Sports Intelligence Ecosystem</span><span>Official · For Ministry of Sports and NOCSL</span><span>© 2025 Everpower Software Solutions</span></div>
</div>`;
  }

  else if (type === 'donor') {
    const { today, totalAthletes, byProvince, actStats, topSports, health, govStats } = data;
    body = `
<div class="cover">
  <div class="cover-org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
  <div class="cover-title">${title}</div>
  <div class="cover-sub">Programme KPIs, participation statistics, and health outcomes — UNDP / World Bank reporting format</div>
  <div class="cover-meta">Generated: ${today} &nbsp;|&nbsp; Reporting Period: January – March 2025 &nbsp;|&nbsp; Classification: Donor-Restricted</div>
</div>
<div class="wrap">
  <h2>Programme Impact Summary</h2>
  <p>This report summarises the key performance indicators and outcomes of the NOCSL Sports Development Programme supported by UNDP Sri Lanka for Q1 2025. Data is drawn from the SLSIE athlete management system.</p>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${totalAthletes}</div><div class="l">Athletes in Programme</div></div>
    <div class="kpi"><div class="v">${byProvince.length}</div><div class="l">Provinces Reached</div></div>
    <div class="kpi"><div class="v">${actStats.sessions}</div><div class="l">Activity Sessions</div></div>
    <div class="kpi"><div class="v">${actStats.hours}h</div><div class="l">Training Hours</div></div>
    <div class="kpi green"><div class="v">${govStats.submitted}</div><div class="l">Federations Reporting</div></div>
    <div class="kpi"><div class="v">${govStats.avg}</div><div class="l">Avg Governance Score</div></div>
  </div>
  <h2>Geographic Reach</h2>
  <table>
    <thead><tr><th>Province</th><th>Athletes Reached</th><th>Share (%)</th></tr></thead>
    <tbody>${byProvince.map(p=>`<tr><td>${p.province}</td><td>${p.c}</td><td>${((p.c/totalAthletes)*100).toFixed(1)}%</td></tr>`).join('')}</tbody>
  </table>
  <h2>Top Sports by Participation</h2>
  <table>
    <thead><tr><th>Sport</th><th>Athletes</th></tr></thead>
    <tbody>${topSports.map(s=>`<tr><td>${s.sport}</td><td>${s.c}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Athlete Health Outcomes (Q1 2025)</h2>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${health.avg_bmi}</div><div class="l">Avg BMI</div></div>
    <div class="kpi green"><div class="v">${health.avg_mental}/10</div><div class="l">Mental Wellbeing</div></div>
    <div class="kpi"><div class="v">${health.avg_sleep}/10</div><div class="l">Sleep Quality</div></div>
  </div>
  <div class="note"><strong>Data Assurance:</strong> All data is collected through the SLSIE platform and is subject to NOCSL data governance protocols. This report is prepared in accordance with UNDP Results-Based Management (RBM) guidelines.</div>
  <div class="footer"><span>SLSIE — Sri Lanka Sports Intelligence Ecosystem</span><span>Donor-Restricted · UNDP Sri Lanka &amp; World Bank</span><span>© 2025 Everpower Software Solutions</span></div>
</div>`;
  }

  return reportHtmlPage(title, body);
}

async function generateWordDoc(type, data) {
  const title = REPORT_TITLES[type] || 'Report';
  const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' };
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
  const hdrBorder = { style: BorderStyle.SINGLE, size: 1, color: '1F4E79' };
  const hdrBorders = { top: hdrBorder, bottom: hdrBorder, left: hdrBorder, right: hdrBorder };

  function hdrCell(text, w) {
    return new TableCell({ borders: hdrBorders, width: { size: w, type: WidthType.DXA },
      shading: { fill: '1F4E79', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })] });
  }
  function dataCell(text, w, opts = {}) {
    return new TableCell({ borders, width: { size: w, type: WidthType.DXA },
      shading: opts.shade ? { fill: 'F0F6FF', type: ShadingType.CLEAR } : undefined,
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: String(text ?? '—'), bold: opts.bold || false, size: 19, font: 'Arial', color: opts.color || '222222' })] })] });
  }
  function h1(text) {
    return new Paragraph({ heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '1F4E79', space: 4 } },
      children: [new TextRun({ text, bold: true, size: 28, color: '1F4E79', font: 'Arial' })] });
  }
  function h2(text) {
    return new Paragraph({ spacing: { before: 180, after: 80 },
      children: [new TextRun({ text, bold: true, size: 22, color: '2E75B6', font: 'Arial' })] });
  }
  function para(text) {
    return new Paragraph({ spacing: { before: 60, after: 120 },
      children: [new TextRun({ text, size: 20, font: 'Arial', color: '444444' })] });
  }

  const coverPara = (text, opts = {}) => new Paragraph({
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    children: [new TextRun({ text, size: opts.size || 22, bold: opts.bold || false, color: opts.color || 'FFFFFF', font: 'Arial' })]
  });

  let children = [];

  // Cover section
  children.push(coverPara('NATIONAL OLYMPIC COMMITTEE OF SRI LANKA', { size: 18, color: 'AACCEE' }));
  children.push(coverPara('Sri Lanka Sports Intelligence Ecosystem (SLSIE) v1.0', { size: 18, color: 'BBDDFF' }));
  children.push(new Paragraph({ spacing: { before: 300, after: 0 }, children: [] }));
  children.push(coverPara(title, { size: 34, bold: true, color: '1F4E79', before: 0 }));
  children.push(new Paragraph({ spacing: { before: 240, after: 0 }, children: [] }));
  children.push(coverPara(`Generated: ${data.today}`, { size: 18, color: '666666' }));
  children.push(coverPara('Confidential — For Authorised Recipients Only', { size: 18, color: '888888' }));
  children.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true }));

  if (type === 'governance') {
    const { scores, pending, avgScore, green, amber, red } = data;
    children.push(h1('Governance Benchmarking Report 2025'));
    children.push(para(`This report presents governance benchmark scores for ${scores.length + pending.length} National Sports Federations (NSFs) affiliated to NOCSL for the 2025 reporting cycle. The overall average score is ${avgScore} / 5.0.`));
    children.push(h2('Summary Statistics'));
    children.push(para(`Submitted: ${scores.length}  |  Pending: ${pending.length}  |  Green (≥4.0): ${green}  |  Amber (3.0–3.9): ${amber}  |  Red (<3.0): ${red}`));
    children.push(h1('Federation Rankings 2025'));
    const colW = [200, 2200, 1200, 700, 700, 700, 700, 700, 700, 700, 700, 900];
    const colSum = colW.reduce((a,b)=>a+b,0);
    children.push(new Table({ width: { size: colSum, type: WidthType.DXA }, columnWidths: colW,
      rows: [
        new TableRow({ tableHeader: true, children: ['#','Federation','Sport','Total','Board','Skills','Strategy','Finance','Integrity','Compliance','Culture','Status'].map((h,i)=>hdrCell(h, colW[i])) }),
        ...scores.map((s, i) => new TableRow({ children: [
          dataCell(i+1, colW[0]),
          dataCell(s.name, colW[1], { bold: true }),
          dataCell(s.sport, colW[2]),
          dataCell(s.total_score.toFixed(2), colW[3], { bold: true, color: s.total_score>=4?'15803D':s.total_score>=3?'B45309':'B91C1C' }),
          dataCell(s.board_composition.toFixed(1), colW[4]),
          dataCell(s.director_skills.toFixed(1), colW[5]),
          dataCell(s.strategic_planning.toFixed(1), colW[6]),
          dataCell(s.financial_transparency.toFixed(1), colW[7]),
          dataCell(s.integrity_risk.toFixed(1), colW[8]),
          dataCell(s.regulatory_compliance.toFixed(1), colW[9]),
          dataCell(s.culture_score.toFixed(1), colW[10]),
          dataCell(s.total_score>=4?'Green':s.total_score>=3?'Amber':'Red', colW[11], { color: s.total_score>=4?'15803D':s.total_score>=3?'B45309':'B91C1C', bold: true }),
        ]}))
      ]
    }));
    if (pending.length) {
      children.push(h1(`Pending Submissions (${pending.length})`));
      const cols = [3000, 2000, 2000];
      children.push(new Table({ width: { size: 7000, type: WidthType.DXA }, columnWidths: cols, rows: [
        new TableRow({ tableHeader: true, children: ['Federation','Sport','Status'].map((h,i)=>hdrCell(h,cols[i])) }),
        ...pending.map(p => new TableRow({ children: [dataCell(p.name, cols[0]), dataCell(p.sport, cols[1]), dataCell('Awaiting Submission', cols[2])] }))
      ]}));
    }
  }

  else if (type === 'fitforlife') {
    const { totalParticipants, byProvince, byGender, bySport, avgBmi, avgSleep, avgMental, avgStress, actStats } = data;
    children.push(h1('Fit for Life Programme Report — May 2025'));
    children.push(para(`The Fit for Life programme tracks biometric, wellness, and activity data for ${totalParticipants} athletes across NOCSL-affiliated federations.`));
    children.push(h2(`Key Indicators: BMI Avg: ${avgBmi}  |  Sleep: ${avgSleep}/10  |  Mental: ${avgMental}/10  |  Stress: ${avgStress}/10  |  Sessions: ${actStats.sessions}  |  Hours: ${actStats.hours}h`));
    children.push(h1('Participation by Province'));
    const pc = [3000, 2000, 2000];
    children.push(new Table({ width: { size: 7000, type: WidthType.DXA }, columnWidths: pc, rows: [
      new TableRow({ tableHeader: true, children: ['Province','Athletes','Share (%)'].map((h,i)=>hdrCell(h,pc[i])) }),
      ...byProvince.map(p => new TableRow({ children: [dataCell(p.province,pc[0]),dataCell(p.c,pc[1]),dataCell(((p.c/totalParticipants)*100).toFixed(1)+'%',pc[2])] }))
    ]}));
    children.push(h1('Gender Distribution'));
    const gc = [3000, 2000, 2000];
    children.push(new Table({ width: { size: 7000, type: WidthType.DXA }, columnWidths: gc, rows: [
      new TableRow({ tableHeader: true, children: ['Gender','Count','Share (%)'].map((h,i)=>hdrCell(h,gc[i])) }),
      ...byGender.map(g => new TableRow({ children: [dataCell(g.gender==='M'?'Male':'Female',gc[0]),dataCell(g.c,gc[1]),dataCell(((g.c/totalParticipants)*100).toFixed(1)+'%',gc[2])] }))
    ]}));
    children.push(h1('Top Sports by Participation'));
    const sc = [4000, 3000];
    children.push(new Table({ width: { size: 7000, type: WidthType.DXA }, columnWidths: sc, rows: [
      new TableRow({ tableHeader: true, children: ['Sport','Athletes'].map((h,i)=>hdrCell(h,sc[i])) }),
      ...bySport.map(s => new TableRow({ children: [dataCell(s.sport,sc[0]),dataCell(s.c,sc[1])] }))
    ]}));
  }

  else if (type === 'injury-risk') {
    const { highRisk, cautionRisk, totalAth } = data;
    children.push(h1('AI Injury Risk Alert Report'));
    children.push(para(`Acute:Chronic Workload Ratio (ACWR) analysis for ${totalAth} monitored athletes. ACWR > 1.5 = HIGH RISK. ACWR 1.3–1.5 = CAUTION.`));
    children.push(h2(`High Risk: ${highRisk.length}  |  Caution: ${cautionRisk.length}  |  Safe: ${totalAth - highRisk.length - cautionRisk.length}`));
    children.push(h1('High Risk Athletes (ACWR > 1.5)'));
    const hc = [2000, 1200, 2000, 700, 900, 1000, 1100];
    children.push(new Table({ width: { size: 8900, type: WidthType.DXA }, columnWidths: hc, rows: [
      new TableRow({ tableHeader: true, children: ['Athlete','Sport','Federation','ACWR','Acute','Chronic','Date'].map((h,i)=>hdrCell(h,hc[i])) }),
      ...(highRisk.length ? highRisk.map(a => new TableRow({ children: [
        dataCell(a.name,hc[0],{bold:true}), dataCell(a.sport,hc[1]), dataCell(a.federation,hc[2]),
        dataCell(a.acwr.toFixed(2),hc[3],{bold:true,color:'B91C1C'}),
        dataCell(a.acute_load,hc[4]), dataCell(a.chronic_load,hc[5]), dataCell(a.load_date,hc[6])
      ]})) : [new TableRow({ children: [dataCell('No high-risk athletes identified.', hc.reduce((a,b)=>a+b,0))] })])
    ]}));
    children.push(h1('Caution Zone Athletes (ACWR 1.3–1.5)'));
    const cc = [2500, 1500, 2500, 900];
    children.push(new Table({ width: { size: 7400, type: WidthType.DXA }, columnWidths: cc, rows: [
      new TableRow({ tableHeader: true, children: ['Athlete','Sport','Federation','ACWR'].map((h,i)=>hdrCell(h,cc[i])) }),
      ...(cautionRisk.length ? cautionRisk.map(a => new TableRow({ children: [dataCell(a.name,cc[0]),dataCell(a.sport,cc[1]),dataCell(a.federation,cc[2]),dataCell(a.acwr.toFixed(2),cc[3],{color:'B45309',bold:true})] })) : [new TableRow({ children: [dataCell('No athletes in caution zone.', cc.reduce((a,b)=>a+b,0))] })])
    ]}));
  }

  else if (type === 'performance') {
    const { athletes, tests } = data;
    children.push(h1('Performance Trend Analysis — Athletics'));
    children.push(para('Longitudinal performance test results for Athletics Sri Lanka athletes across three test cycles (Dec 2024 – Apr 2025).'));
    children.push(h1('Athlete Roster'));
    const ac = [2500, 1500, 2000, 1500];
    children.push(new Table({ width: { size: 7500, type: WidthType.DXA }, columnWidths: ac, rows: [
      new TableRow({ tableHeader: true, children: ['Athlete','Birth Year','Province','Tests Recorded'].map((h,i)=>hdrCell(h,ac[i])) }),
      ...athletes.map(a => { const cnt = tests.filter(t=>t.name===a.name).length;
        return new TableRow({ children: [dataCell(a.name,ac[0],{bold:true}),dataCell(a.birth_year,ac[1]),dataCell(a.province||'—',ac[2]),dataCell(cnt,ac[3])] }); })
    ]}));
    children.push(h1('Test Results'));
    const tc = [2000, 2000, 1200, 900, 800];
    children.push(new Table({ width: { size: 6900, type: WidthType.DXA }, columnWidths: tc, rows: [
      new TableRow({ tableHeader: true, children: ['Athlete','Test Type','Date','Result','Unit'].map((h,i)=>hdrCell(h,tc[i])) }),
      ...tests.map(t => new TableRow({ children: [dataCell(t.name,tc[0]),dataCell(t.test_type,tc[1]),dataCell(t.test_date,tc[2]),dataCell(t.result,tc[3],{bold:true}),dataCell(t.unit,tc[4])] }))
    ]}));
  }

  else if (type === 'compliance') {
    const { federations, compliant, nonCompliant, pending } = data;
    children.push(h1('Federation Compliance Report'));
    children.push(para(`Regulatory compliance status against National Sports Associations Regulations No. 01 of 2025. Compliant: ${compliant}  |  Non-Compliant: ${nonCompliant}  |  Pending: ${pending}`));
    const fc = [2400, 1200, 600, 1200, 800, 800, 900, 1200];
    children.push(new Table({ width: { size: 9100, type: WidthType.DXA }, columnWidths: fc, rows: [
      new TableRow({ tableHeader: true, children: ['Federation','Sport','Est.','Province','Members','Gov. Score','Reg. Comp.','Status'].map((h,i)=>hdrCell(h,fc[i])) }),
      ...federations.map(f => new TableRow({ children: [
        dataCell(f.name,fc[0]), dataCell(f.sport,fc[1]), dataCell(f.established_year,fc[2]), dataCell(f.province,fc[3]),
        dataCell(f.total_members?.toLocaleString(),fc[4]),
        dataCell(f.total_score ? f.total_score.toFixed(2) : '—',fc[5]),
        dataCell(f.reg_comp ? f.reg_comp.toFixed(1) : '—',fc[6]),
        dataCell(f.status,fc[7], { bold:true, color: f.status==='Compliant'?'15803D':f.status==='Non-Compliant'?'B91C1C':'888888' })
      ]}))
    ]}));
  }

  else if (type === 'donor') {
    const { totalAthletes, byProvince, actStats, topSports, health, govStats } = data;
    children.push(h1('Donor Impact Report — Q1 2025'));
    children.push(para(`Programme outcomes for the NOCSL Sports Development Programme supported by UNDP Sri Lanka. Q1 2025 reporting period.`));
    children.push(h2(`Athletes: ${totalAthletes}  |  Provinces: ${byProvince.length}  |  Sessions: ${actStats.sessions}  |  Hours: ${actStats.hours}h  |  Federations Reporting: ${govStats.submitted}  |  Avg Gov Score: ${govStats.avg}`));
    children.push(h1('Geographic Reach'));
    const gc = [3000, 2000, 2000];
    children.push(new Table({ width: { size: 7000, type: WidthType.DXA }, columnWidths: gc, rows: [
      new TableRow({ tableHeader: true, children: ['Province','Athletes','Share (%)'].map((h,i)=>hdrCell(h,gc[i])) }),
      ...byProvince.map(p => new TableRow({ children: [dataCell(p.province,gc[0]),dataCell(p.c,gc[1]),dataCell(((p.c/totalAthletes)*100).toFixed(1)+'%',gc[2])] }))
    ]}));
    children.push(h1('Health Outcomes'));
    children.push(h2(`Avg BMI: ${health.avg_bmi}  |  Mental Wellbeing: ${health.avg_mental}/10  |  Sleep Quality: ${health.avg_sleep}/10`));
    children.push(h1('Top Sports by Participation'));
    const sc = [4000, 3000];
    children.push(new Table({ width: { size: 7000, type: WidthType.DXA }, columnWidths: sc, rows: [
      new TableRow({ tableHeader: true, children: ['Sport','Athletes'].map((h,i)=>hdrCell(h,sc[i])) }),
      ...topSports.map(s => new TableRow({ children: [dataCell(s.sport,sc[0]),dataCell(s.c,sc[1])] }))
    ]}));
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
    },
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } }
      },
      children
    }]
  });
  return Packer.toBuffer(doc);
}

app.get('/reports/html/:type', auth, (req, res) => {
  const type = req.params.type;
  if (!REPORT_TITLES[type]) return res.status(404).send('Unknown report type');
  try {
    const data = getReportData(type);
    const html = generateHtmlReport(type, data);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Report HTML error:', err);
    res.status(500).send(`<pre>Error generating report: ${err.message}</pre>`);
  }
});

app.get('/reports/word/:type', auth, async (req, res) => {
  const type = req.params.type;
  if (!REPORT_TITLES[type]) return res.status(404).json({ error: 'Unknown report type' });
  try {
    const data = getReportData(type);
    const buf = await generateWordDoc(type, data);
    const filename = `SLSIE_${type}_report_${new Date().toISOString().slice(0,10)}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (err) {
    console.error('Report Word error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PAGE ROUTES ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/login.html'));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏆 SLSIE — Sri Lanka Sports Intelligence Ecosystem`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`\n   Demo logins:`);
  console.log(`   admin@nocsl.lk     / admin123   (NOCSL Admin)`);
  console.log(`   cricket@nocsl.lk   / fed123     (Cricket Federation)`);
  console.log(`   ministry@sports.gov.lk / gov123 (Ministry)`);
});
