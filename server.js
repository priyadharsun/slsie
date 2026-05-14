'use strict';
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, WidthType, ShadingType, BorderStyle } = require('docx');
const Anthropic = require('@anthropic-ai/sdk');

// ─── AI CLIENT ────────────────────────────────────────────────────────────────
let ai = null;
if (process.env.ANTHROPIC_API_KEY) {
  ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log('🤖 AI Assistant: Claude API connected');
} else {
  console.log('⚠  AI Assistant: ANTHROPIC_API_KEY not set — AI features disabled');
}

async function aiAsk(systemPrompt, userMsg, maxTokens = 350) {
  if (!ai) return null;
  try {
    const r = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    });
    return r.content[0]?.text || null;
  } catch (e) {
    console.error('AI error:', e.message);
    return null;
  }
}

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
  color TEXT DEFAULT '#2E75B6',
  annual_turnover REAL DEFAULT 0,
  affiliated_clubs INTEGER DEFAULT 0,
  agm_last_date TEXT,
  financial_stmt_date TEXT,
  strategic_plan_year INTEGER,
  national_championship_date TEXT
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

CREATE TABLE IF NOT EXISTS ec_officers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  federation_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  gender TEXT DEFAULT 'M',
  role TEXT NOT NULL,
  appointed_year INTEGER,
  is_disqualified INTEGER DEFAULT 0,
  disqualification_notes TEXT,
  status TEXT DEFAULT 'active',
  FOREIGN KEY(federation_id) REFERENCES federations(id)
);
`);

// Schema migrations for existing databases
['annual_turnover REAL DEFAULT 0', 'affiliated_clubs INTEGER DEFAULT 0',
 'agm_last_date TEXT', 'financial_stmt_date TEXT',
 'strategic_plan_year INTEGER', 'national_championship_date TEXT',
].forEach(col => { try { db.exec(`ALTER TABLE federations ADD COLUMN ${col}`); } catch {} });

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

  // Federation compliance & grading data [id, clubs, turnover_LKR, agm, fin_stmt, strat_year, champ]
  const compData = [
    [1,  45, 180000000, '2025-03-15', '2025-05-10', 2025, '2025-04-20'],
    [2,  28,  55000000, '2025-04-10', '2025-05-08', 2025, '2025-03-15'],
    [3,  38,  75000000, '2024-12-10', '2025-02-05', 2024, '2025-01-20'],
    [4,  20,  22000000, '2025-02-20', '2025-04-15', 2025, '2025-03-10'],
    [5,  22,  28000000, '2024-08-05',  null,         2023, '2024-10-12'],
    [6,  18,  15000000, '2025-01-18', '2025-03-22', 2024, '2025-02-14'],
    [7,  12,   8000000,  null,         '2025-04-05', 2025, '2025-02-28'],
    [8,  10,   6000000, '2025-05-02', '2025-05-12', 2025, '2025-04-30'],
    [9,  22,  18000000, '2025-03-08', '2025-05-05', 2025, '2025-04-08'],
    [10, 14,   9000000, '2024-11-20', '2025-01-15', 2024, '2024-12-10'],
    [11,  8,   4000000, '2025-02-12',  null,         2024, '2025-02-25'],
    [12,  6,   3000000, '2025-04-18', '2025-05-08', 2025, '2025-03-20'],
    [13,  7,   4000000,  null,          null,         2023,  null],
    [14,  8,   4000000, '2025-03-25', '2025-05-15', 2024, '2025-03-25'],
    [15, 10,   5000000, '2025-01-22', '2025-03-10', 2025, '2025-02-05'],
    [16, 14,   7000000, '2025-02-14', '2025-04-20', 2025, '2025-03-01'],
    [17,  6,   3000000, '2025-03-18', '2025-05-02', 2025, '2025-04-15'],
    [18,  8,   4000000, '2025-04-05', '2025-05-08', 2025, '2025-05-01'],
    [19, 22,  12000000, '2025-01-15', '2025-03-08', 2025, '2025-02-20'],
    [20, 18,  10000000, '2025-02-28', '2025-04-22', 2025, '2025-03-18'],
    [21,  8,   4000000, '2024-09-12',  null,         2024, '2024-11-05'],
    [22, 20,  12000000, '2025-03-20', '2025-05-10', 2025, '2025-04-12'],
    [23, 16,  11000000, '2025-01-28', '2025-03-15', 2025, '2025-02-22'],
    [24,  5,   2500000, '2025-04-08', '2025-05-05', 2025, '2025-04-20'],
    [25,  4,   2000000, '2025-03-15', '2025-04-28', 2025, '2025-04-05'],
    [26,  3,   2000000,  null,          null,         2023,  null],
    [27,  5,   2500000, '2025-02-22', '2025-04-18', 2025, '2025-03-28'],
    [28,  8,   3500000, '2025-01-30', '2025-03-25', 2025, '2025-02-28'],
    [29,  5,   2000000, '2025-02-15', '2025-04-05', 2024, '2025-03-10'],
    [30, 15,   8000000, '2025-03-22', '2025-05-08', 2025, '2025-04-18'],
    [31,  7,   3000000,  null,          null,         2024, '2025-01-25'],
    [32,  6,   2000000, '2025-04-12', '2025-05-05', 2025, '2025-05-02'],
    [33, 12,   5000000, '2025-02-08', '2025-04-10', 2025,  null],
    [34,  8,   3500000, '2025-03-10', '2025-04-25', 2025, '2025-04-20'],
  ];
  const updComp = db.prepare('UPDATE federations SET affiliated_clubs=?,annual_turnover=?,agm_last_date=?,financial_stmt_date=?,strategic_plan_year=?,national_championship_date=? WHERE id=?');
  compData.forEach(([id, clubs, turn, agm, fin, splan, champ]) =>
    updComp.run(clubs, turn, agm, fin, splan, champ, id));

  // EC Officers [fed_id, name, gender, role, appointed_year, is_disqualified, notes]
  const ecOfficers = [
    [1, 'Shammi Silva',        'M', 'President',  2017, 0, null],   // at 8yr term limit
    [1, 'Mohan de Silva',      'M', 'Secretary',  2019, 0, null],
    [1, 'Sujeewa Kumara',      'M', 'Treasurer',  2021, 0, null],
    [1, 'Chamari Wijeratne',   'F', 'EC Member',  2018, 0, null],
    [1, 'Dilhara Peiris',      'F', 'EC Member',  2020, 0, null],
    [1, 'Kasun Rajapaksha',    'M', 'EC Member',  2022, 0, null],
    [2, 'Jagath Perera',       'M', 'President',  2020, 0, null],
    [2, 'Nimal Fernando',      'M', 'Secretary',  2021, 0, null],
    [2, 'Suresh Kumara',       'M', 'Treasurer',  2022, 0, null],
    [2, 'Nilani Dissanayake',  'F', 'EC Member',  2021, 0, null],
    [2, 'Priyanka Senaratne',  'F', 'EC Member',  2022, 0, null],
    [2, 'Chaminda Jayasinghe', 'M', 'EC Member',  2023, 0, null],
    [3, 'Jaswar Umar',         'M', 'President',  2018, 0, null],
    [3, 'Sampath Nanayakkara', 'M', 'Secretary',  2019, 0, null],
    [3, 'Dilip Jayawardena',   'M', 'Treasurer',  2017, 0, null],  // at 8yr term limit
    [3, 'Fathima Rizwa',       'F', 'EC Member',  2020, 0, null],
    [3, 'Nishantha Perera',    'M', 'EC Member',  2021, 0, null],
    [3, 'Chamara Subasinghe',  'M', 'EC Member',  2022, 0, null],
    [4, 'Asanka Gurusinha',    'M', 'President',  2022, 0, null],   // 0 female → quota fail
    [4, 'Pathum Jayawardena',  'M', 'Secretary',  2022, 0, null],
    [4, 'Ramesh Silva',        'M', 'Treasurer',  2023, 0, null],
    [4, 'Dinesh Pathirana',    'M', 'EC Member',  2022, 0, null],
    [4, 'Shanaka Rodrigo',     'M', 'EC Member',  2023, 0, null],
    [5, 'Dilhara Fernando',    'M', 'President',  2015, 1, 'Convicted of criminal offence (Gazette Reg. Sec. 22.1.f)'],
    [5, 'Roshan Jayakody',     'M', 'Secretary',  2021, 0, null],
    [5, 'Saman Bandara',       'M', 'Treasurer',  2022, 0, null],
    [5, 'Harshini Jayaratne',  'F', 'EC Member',  2022, 0, null],
    [5, 'Chamathi de Silva',   'F', 'EC Member',  2023, 0, null],
    [5, 'Ruwan Wijeratne',     'M', 'EC Member',  2021, 0, null],
  ];
  const insEc = db.prepare('INSERT INTO ec_officers (federation_id,name,gender,role,appointed_year,is_disqualified,disqualification_notes) VALUES (?,?,?,?,?,?,?)');
  ecOfficers.forEach(o => insEc.run(...o));

  console.log('✅ Database seeded successfully.');
}

// Run seed only if empty
const fedCount = db.prepare('SELECT COUNT(*) as c FROM federations').get();
if (fedCount.c === 0) seed();

// Data migration: populate gazette compliance fields if still at defaults
const needsCompMigration = db.prepare('SELECT COUNT(*) as c FROM federations WHERE affiliated_clubs > 0').get().c === 0;
if (needsCompMigration && fedCount.c > 0) {
  const compData = [
    [1,  45, 180000000, '2025-03-15', '2025-05-10', 2025, '2025-04-20'],
    [2,  28,  55000000, '2025-04-10', '2025-05-08', 2025, '2025-03-15'],
    [3,  38,  75000000, '2024-12-10', '2025-02-05', 2024, '2025-01-20'],
    [4,  20,  22000000, '2025-02-20', '2025-04-15', 2025, '2025-03-10'],
    [5,  22,  28000000, '2024-08-05',  null,         2023, '2024-10-12'],
    [6,  18,  15000000, '2025-01-18', '2025-03-22', 2024, '2025-02-14'],
    [7,  12,   8000000,  null,         '2025-04-05', 2025, '2025-02-28'],
    [8,  10,   6000000, '2025-05-02', '2025-05-12', 2025, '2025-04-30'],
    [9,  22,  18000000, '2025-03-08', '2025-05-05', 2025, '2025-04-08'],
    [10, 14,   9000000, '2024-11-20', '2025-01-15', 2024, '2024-12-10'],
    [11,  8,   4000000, '2025-02-12',  null,         2024, '2025-02-25'],
    [12,  6,   3000000, '2025-04-18', '2025-05-08', 2025, '2025-03-20'],
    [13,  7,   4000000,  null,          null,         2023,  null],
    [14,  8,   4000000, '2025-03-25', '2025-05-15', 2024, '2025-03-25'],
    [15, 10,   5000000, '2025-01-22', '2025-03-10', 2025, '2025-02-05'],
    [16, 14,   7000000, '2025-02-14', '2025-04-20', 2025, '2025-03-01'],
    [17,  6,   3000000, '2025-03-18', '2025-05-02', 2025, '2025-04-15'],
    [18,  8,   4000000, '2025-04-05', '2025-05-08', 2025, '2025-05-01'],
    [19, 22,  12000000, '2025-01-15', '2025-03-08', 2025, '2025-02-20'],
    [20, 18,  10000000, '2025-02-28', '2025-04-22', 2025, '2025-03-18'],
    [21,  8,   4000000, '2024-09-12',  null,         2024, '2024-11-05'],
    [22, 20,  12000000, '2025-03-20', '2025-05-10', 2025, '2025-04-12'],
    [23, 16,  11000000, '2025-01-28', '2025-03-15', 2025, '2025-02-22'],
    [24,  5,   2500000, '2025-04-08', '2025-05-05', 2025, '2025-04-20'],
    [25,  4,   2000000, '2025-03-15', '2025-04-28', 2025, '2025-04-05'],
    [26,  3,   2000000,  null,          null,         2023,  null],
    [27,  5,   2500000, '2025-02-22', '2025-04-18', 2025, '2025-03-28'],
    [28,  8,   3500000, '2025-01-30', '2025-03-25', 2025, '2025-02-28'],
    [29,  5,   2000000, '2025-02-15', '2025-04-05', 2024, '2025-03-10'],
    [30, 15,   8000000, '2025-03-22', '2025-05-08', 2025, '2025-04-18'],
    [31,  7,   3000000,  null,          null,         2024, '2025-01-25'],
    [32,  6,   2000000, '2025-04-12', '2025-05-05', 2025, '2025-05-02'],
    [33, 12,   5000000, '2025-02-08', '2025-04-10', 2025,  null],
    [34,  8,   3500000, '2025-03-10', '2025-04-25', 2025, '2025-04-20'],
  ];
  const updComp = db.prepare('UPDATE federations SET affiliated_clubs=?,annual_turnover=?,agm_last_date=?,financial_stmt_date=?,strategic_plan_year=?,national_championship_date=? WHERE id=?');
  compData.forEach(([id, clubs, turn, agm, fin, splan, champ]) =>
    updComp.run(clubs, turn, agm, fin, splan, champ, id));
  console.log('✅ Gazette compliance data migrated.');
}

// EC officers migration
const needsEcMigration = db.prepare('SELECT COUNT(*) as c FROM ec_officers').get().c === 0 && fedCount.c > 0;
if (needsEcMigration) {
  const ecOfficers = [
    [1, 'Shammi Silva',        'M', 'President',  2017, 0, null],
    [1, 'Mohan de Silva',      'M', 'Secretary',  2019, 0, null],
    [1, 'Sujeewa Kumara',      'M', 'Treasurer',  2021, 0, null],
    [1, 'Chamari Wijeratne',   'F', 'EC Member',  2018, 0, null],
    [1, 'Dilhara Peiris',      'F', 'EC Member',  2020, 0, null],
    [1, 'Kasun Rajapaksha',    'M', 'EC Member',  2022, 0, null],
    [2, 'Jagath Perera',       'M', 'President',  2020, 0, null],
    [2, 'Nimal Fernando',      'M', 'Secretary',  2021, 0, null],
    [2, 'Suresh Kumara',       'M', 'Treasurer',  2022, 0, null],
    [2, 'Nilani Dissanayake',  'F', 'EC Member',  2021, 0, null],
    [2, 'Priyanka Senaratne',  'F', 'EC Member',  2022, 0, null],
    [2, 'Chaminda Jayasinghe', 'M', 'EC Member',  2023, 0, null],
    [3, 'Jaswar Umar',         'M', 'President',  2018, 0, null],
    [3, 'Sampath Nanayakkara', 'M', 'Secretary',  2019, 0, null],
    [3, 'Dilip Jayawardena',   'M', 'Treasurer',  2017, 0, null],
    [3, 'Fathima Rizwa',       'F', 'EC Member',  2020, 0, null],
    [3, 'Nishantha Perera',    'M', 'EC Member',  2021, 0, null],
    [3, 'Chamara Subasinghe',  'M', 'EC Member',  2022, 0, null],
    [4, 'Asanka Gurusinha',    'M', 'President',  2022, 0, null],
    [4, 'Pathum Jayawardena',  'M', 'Secretary',  2022, 0, null],
    [4, 'Ramesh Silva',        'M', 'Treasurer',  2023, 0, null],
    [4, 'Dinesh Pathirana',    'M', 'EC Member',  2022, 0, null],
    [4, 'Shanaka Rodrigo',     'M', 'EC Member',  2023, 0, null],
    [5, 'Dilhara Fernando',    'M', 'President',  2015, 1, 'Convicted of criminal offence (Gazette Reg. Sec. 22.1.f)'],
    [5, 'Roshan Jayakody',     'M', 'Secretary',  2021, 0, null],
    [5, 'Saman Bandara',       'M', 'Treasurer',  2022, 0, null],
    [5, 'Harshini Jayaratne',  'F', 'EC Member',  2022, 0, null],
    [5, 'Chamathi de Silva',   'F', 'EC Member',  2023, 0, null],
    [5, 'Ruwan Wijeratne',     'M', 'EC Member',  2021, 0, null],
  ];
  const insEc = db.prepare('INSERT INTO ec_officers (federation_id,name,gender,role,appointed_year,is_disqualified,disqualification_notes) VALUES (?,?,?,?,?,?,?)');
  ecOfficers.forEach(o => insEc.run(...o));
  console.log('✅ EC officers migrated.');
}

function fedGrade(clubs, turnover) {
  if (clubs >= 25 && turnover >= 50000000) return 'A';
  if (clubs >= 15 && turnover >= 10000000) return 'B';
  return 'C';
}

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

// ─── COMPLIANCE & GAZETTE ────────────────────────────────────────────────────

function complianceChecks(f, femaleEcCount) {
  const YEAR = 2025;
  const agmCompliant  = !!(f.agm_last_date  && new Date(f.agm_last_date).getFullYear()  >= YEAR);
  const finCompliant  = !!(f.financial_stmt_date && new Date(f.financial_stmt_date).getFullYear() >= YEAR);
  const stratCompliant = !!(f.strategic_plan_year && f.strategic_plan_year >= YEAR - 1);
  const genderCompliant = femaleEcCount >= 2;
  const champCompliant = !!f.national_championship_date;
  const pass = [agmCompliant, finCompliant, stratCompliant, genderCompliant, champCompliant].filter(Boolean).length;
  return { agmCompliant, finCompliant, stratCompliant, genderCompliant, champCompliant,
           complianceScore: `${pass}/5`, compliancePct: Math.round((pass/5)*100) };
}

app.get('/api/compliance/overview', auth, (req, res) => {
  const feds = db.prepare(`SELECT f.* FROM federations f ORDER BY f.name`).all();
  const result = feds.map(f => {
    const grade = fedGrade(f.affiliated_clubs, f.annual_turnover);
    const femaleEcCount = db.prepare(
      "SELECT COUNT(*) as c FROM ec_officers WHERE federation_id=? AND gender='F' AND status='active' AND is_disqualified=0"
    ).get(f.id).c;
    const checks = complianceChecks(f, femaleEcCount);
    return { ...f, grade, femaleEcCount, ...checks };
  });
  res.json(result);
});

app.get('/api/federations/:id/ec-officers', auth, (req, res) => {
  const officers = db.prepare('SELECT * FROM ec_officers WHERE federation_id=? ORDER BY CASE role WHEN \'President\' THEN 1 WHEN \'Secretary\' THEN 2 WHEN \'Treasurer\' THEN 3 ELSE 4 END, name').all(req.params.id);
  const YEAR = 2025;
  const enriched = officers.map(o => {
    const yearsServed = YEAR - (o.appointed_year || YEAR);
    const isKeyRole   = ['President','Secretary','Treasurer'].includes(o.role);
    const limit       = isKeyRole ? 8 : 12;
    const termStatus  = yearsServed >= limit ? 'exceeded' : yearsServed >= limit - 1 ? 'final-year' : 'ok';
    return { ...o, yearsServed, termLimit: limit, termStatus };
  });
  res.json(enriched);
});

app.post('/api/federations/:id/ec-officers', auth, authWrite, (req, res) => {
  const u = req.session.user;
  if (u.role === 'coach') return res.status(403).json({ error: 'Coaches cannot manage EC officers.' });
  if (u.role === 'federation' && u.federation_id !== Number(req.params.id))
    return res.status(403).json({ error: 'You can only manage your own federation officers.' });
  const { name, gender, role, appointed_year } = req.body;
  const r = db.prepare('INSERT INTO ec_officers (federation_id,name,gender,role,appointed_year) VALUES (?,?,?,?,?)')
    .run(Number(req.params.id), name, gender || 'M', role, Number(appointed_year) || new Date().getFullYear());
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/federations/:id/ec-officers/:eid', auth, authWrite, (req, res) => {
  const u = req.session.user;
  if (u.role === 'coach') return res.status(403).json({ error: 'Coaches cannot manage EC officers.' });
  if (u.role === 'federation' && u.federation_id !== Number(req.params.id))
    return res.status(403).json({ error: 'You can only manage your own federation officers.' });
  const { is_disqualified, disqualification_notes, status } = req.body;
  db.prepare('UPDATE ec_officers SET is_disqualified=?,disqualification_notes=?,status=? WHERE id=? AND federation_id=?')
    .run(is_disqualified ? 1 : 0, disqualification_notes || null, status || 'active', req.params.eid, req.params.id);
  res.json({ ok: true });
});

app.put('/api/federations/:id/compliance', auth, authWrite, (req, res) => {
  const u = req.session.user;
  if (u.role === 'coach') return res.status(403).json({ error: 'Coaches cannot update compliance data.' });
  if (u.role === 'federation' && u.federation_id !== Number(req.params.id))
    return res.status(403).json({ error: 'You can only update your own federation compliance.' });
  const { agm_last_date, financial_stmt_date, strategic_plan_year,
          national_championship_date, affiliated_clubs, annual_turnover } = req.body;
  db.prepare(`UPDATE federations SET agm_last_date=?,financial_stmt_date=?,strategic_plan_year=?,
    national_championship_date=?,affiliated_clubs=?,annual_turnover=? WHERE id=?`)
    .run(agm_last_date || null, financial_stmt_date || null,
         Number(strategic_plan_year) || null, national_championship_date || null,
         Number(affiliated_clubs) || 0, Number(annual_turnover) || 0, req.params.id);
  res.json({ ok: true });
});

// ─── AI ENDPOINTS ────────────────────────────────────────────────────────────

// Chatbot: natural language queries against live platform data
app.post('/api/ai/chat', auth, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });
  if (!ai) return res.json({ reply: 'AI Assistant is not configured on this server. Please set the ANTHROPIC_API_KEY environment variable to enable this feature.' });

  const u = req.session.user;

  // Build live context snapshot from DB
  const totalFeds   = db.prepare('SELECT COUNT(*) as c FROM federations').get().c;
  const govStats    = db.prepare('SELECT COUNT(DISTINCT federation_id) as sub, ROUND(AVG(total_score),2) as avg FROM governance_scores WHERE year=2025').get();
  const topFeds     = db.prepare('SELECT f.name, f.sport, g.total_score FROM governance_scores g JOIN federations f ON f.id=g.federation_id WHERE g.year=2025 ORDER BY g.total_score DESC LIMIT 5').all();
  const bottomFeds  = db.prepare('SELECT f.name, f.sport, g.total_score FROM governance_scores g JOIN federations f ON f.id=g.federation_id WHERE g.year=2025 ORDER BY g.total_score ASC LIMIT 3').all();
  const pending     = db.prepare('SELECT f.name FROM federations f WHERE f.id NOT IN (SELECT federation_id FROM governance_scores WHERE year=2025)').all();
  const highRisk    = db.prepare(`SELECT p.name, p.sport, t.acwr FROM training_loads t JOIN participants p ON p.id=t.participant_id WHERE t.load_date=(SELECT MAX(load_date) FROM training_loads WHERE participant_id=t.participant_id) AND t.acwr>1.5 ORDER BY t.acwr DESC`).all();
  const totalAth    = db.prepare("SELECT COUNT(*) as c FROM participants WHERE participant_type='athlete'").get().c;
  const gradeA      = db.prepare('SELECT COUNT(*) as c FROM federations WHERE affiliated_clubs>=25 AND annual_turnover>=50000000').get().c;
  const gradeB      = db.prepare('SELECT COUNT(*) as c FROM federations WHERE (affiliated_clubs>=15 AND annual_turnover>=10000000) AND NOT (affiliated_clubs>=25 AND annual_turnover>=50000000)').get().c;
  const fullComp    = db.prepare(`SELECT COUNT(*) as c FROM federations WHERE agm_last_date IS NOT NULL AND strftime('%Y',agm_last_date)='2025' AND financial_stmt_date IS NOT NULL AND strftime('%Y',financial_stmt_date)='2025' AND strategic_plan_year>=2024 AND national_championship_date IS NOT NULL`).get().c;
  const disqOfficers = db.prepare('SELECT e.name, e.role, f.name as fed FROM ec_officers e JOIN federations f ON f.id=e.federation_id WHERE e.is_disqualified=1').all();

  const scopeNote = u.role === 'federation' || u.role === 'coach'
    ? `Note: This user is scoped to federation ID ${u.federation_id}.`
    : '';

  const system = `You are SLSIE AI Assistant — the intelligent assistant embedded in the Sri Lanka Sports Intelligence Ecosystem platform for the National Olympic Committee of Sri Lanka (NOCSL).

LIVE PLATFORM DATA (as of today):
- Member Federations: ${totalFeds} | Grade A: ${gradeA} | Grade B: ${gradeB} | Grade C: ${totalFeds - gradeA - gradeB}
- Governance 2025: ${govStats.sub}/${totalFeds} submitted | Avg score: ${govStats.avg}/5.0
- Top federations: ${topFeds.map(f => f.name.replace('Sri Lanka ','SL ')+' ('+f.total_score.toFixed(1)+')').join(', ')}
- Lowest governance: ${bottomFeds.map(f => f.name.replace('Sri Lanka ','SL ')+' ('+f.total_score.toFixed(1)+')').join(', ')}
- Pending governance submissions: ${pending.length > 0 ? pending.map(f => f.name).join(', ') : 'None'}
- Total athletes tracked: ${totalAth}
- HIGH injury risk athletes (ACWR>1.5): ${highRisk.length > 0 ? highRisk.map(a => a.name+' ('+a.sport+', ACWR:'+a.acwr+')').join(', ') : 'None currently'}
- Fully compliant federations (5/5 gazette): ${fullComp}/${totalFeds}
- Disqualified EC officers: ${disqOfficers.length > 0 ? disqOfficers.map(o => o.name+' ('+o.role+', '+o.fed+')').join(', ') : 'None'}
- Logged-in user: ${u.name} | Role: ${u.role}
${scopeNote}

Answer clearly and helpfully. Use specific numbers from the data. When listing multiple items (federations, athletes, scores, comparisons), present them as a markdown table with appropriate columns — for example | Federation | Score | Status |. For simple factual answers, 1–3 sentences is fine. If the question is outside the data available, say so clearly. Do not fabricate data.`;

  // Include prior turns for context
  const messages = [
    ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  if (!ai) return res.json({ reply: 'AI not configured.' });
  try {
    const r = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system,
      messages,
    });
    res.json({ reply: r.content[0]?.text || 'No response.' });
  } catch (e) {
    console.error('Chat AI error:', e.message);
    res.json({ reply: 'I encountered an error. Please try again.' });
  }
});

// Athlete AI coaching insight
app.get('/api/ai/athlete-insight/:id', auth, async (req, res) => {
  if (!ai) return res.json({ insight: null });
  const p = db.prepare('SELECT p.*, f.name as fed FROM participants p LEFT JOIN federations f ON f.id=p.federation_id WHERE p.id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });

  const bio   = db.prepare('SELECT * FROM biometric_records WHERE participant_id=? ORDER BY record_date DESC LIMIT 1').get(req.params.id);
  const loads = db.prepare('SELECT * FROM training_loads WHERE participant_id=? ORDER BY load_date DESC LIMIT 6').all(req.params.id);
  const tests = db.prepare('SELECT * FROM performance_tests WHERE participant_id=? ORDER BY test_date DESC LIMIT 6').all(req.params.id);

  const acwrTrend = loads.map(l => l.acwr).filter(Boolean);
  const acwrDir   = acwrTrend.length >= 2 ? (acwrTrend[0] > acwrTrend[1] ? 'rising' : 'falling') : 'stable';

  const prompt = `Athlete: ${p.name} | Sport: ${p.sport} | Age: ${2025 - p.birth_year} | Federation: ${p.fed}
${bio ? `Latest biometrics (${bio.record_date}): Weight ${bio.weight_kg}kg, BMI ${bio.bmi}, Body fat ${bio.body_fat_pct}%, HR ${bio.heart_rate}bpm, Sleep ${bio.sleep_quality}/10, Stress ${bio.stress_level}/10, Mental wellbeing ${bio.mental_wellbeing}/10, Soreness ${bio.soreness}/10` : 'No biometric data.'}
${loads.length ? `Training load (recent ${loads.length} sessions): ACWR trend ${acwrDir} — ${loads.slice(0,3).map(l=>`${l.load_date}: ACWR ${l.acwr} (ATL ${l.acute_load}, CTL ${l.chronic_load})`).join(' | ')}` : 'No training load data.'}
${tests.length ? `Performance tests: ${tests.map(t=>`${t.test_type} ${t.result}${t.unit} (${t.test_date})`).join(' | ')}` : 'No performance test data.'}

Write a structured coaching insight using exactly this format (each on its own line, separated by a blank line):

**Key Finding:** [one sentence on the most important trend or risk]

**Recommendation:** [one specific, actionable coaching recommendation]

**Wellness Note:** [one sentence on sleep, stress, soreness, or mental wellbeing]

Be direct and specific. Use numbers from the data.`;

  const insight = await aiAsk('You are an elite sports science AI for NOCSL Sri Lanka. Analyse athlete data and provide concise, actionable coaching insights. Always use the exact structured format requested — each section on its own line separated by a blank line.', prompt, 320);
  res.json({ insight });
});

// Federation AI governance & compliance insight
app.get('/api/ai/federation-insight/:id', auth, async (req, res) => {
  if (!ai) return res.json({ insight: null });
  const f = db.prepare('SELECT * FROM federations WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });

  const scores     = db.prepare('SELECT * FROM governance_scores WHERE federation_id=? ORDER BY year DESC LIMIT 2').all(req.params.id);
  const officers   = db.prepare('SELECT * FROM ec_officers WHERE federation_id=?').all(req.params.id);
  const femaleEc   = officers.filter(o => o.gender === 'F' && !o.is_disqualified && o.status === 'active').length;
  const disq       = officers.filter(o => o.is_disqualified);
  const termIssues = officers.filter(o => {
    const yrs = 2025 - (o.appointed_year || 2025);
    const lim = ['President','Secretary','Treasurer'].includes(o.role) ? 8 : 12;
    return yrs >= lim && !o.is_disqualified && o.status === 'active';
  });
  const grade = fedGrade(f.affiliated_clubs, f.annual_turnover);
  const s25   = scores.find(s => s.year === 2025);
  const s24   = scores.find(s => s.year === 2024);
  const yoyChange = s25 && s24 ? (s25.total_score - s24.total_score).toFixed(2) : null;

  const compLine = [
    f.agm_last_date && new Date(f.agm_last_date).getFullYear() >= 2025 ? null : 'AGM not held in 2025',
    f.financial_stmt_date && new Date(f.financial_stmt_date).getFullYear() >= 2025 ? null : 'Financial statements not submitted',
    f.strategic_plan_year && f.strategic_plan_year >= 2024 ? null : 'No current strategic plan',
    femaleEc >= 2 ? null : `Gender quota not met (${femaleEc} female EC officers)`,
    f.national_championship_date ? null : 'National championship not recorded',
  ].filter(Boolean);

  const prompt = `Federation: ${f.name} | Sport: ${f.sport} | Est. ${f.established_year} | Province: ${f.province} | Grade: ${grade}
Clubs: ${f.affiliated_clubs} | Annual Turnover: Rs.${(f.annual_turnover/1000000).toFixed(1)}M
${s25 ? `Governance 2025: ${s25.total_score.toFixed(2)}/5.0 (Board ${s25.board_composition}, Skills ${s25.director_skills}, Strategy ${s25.strategic_planning}, Finance ${s25.financial_transparency}, Integrity ${s25.integrity_risk}, Compliance ${s25.regulatory_compliance}, Culture ${s25.culture_score})` : 'No 2025 governance score submitted.'}
${yoyChange ? `Year-on-year change: ${yoyChange > 0 ? '+' : ''}${yoyChange}` : ''}
EC Officers: ${officers.length} total | ${femaleEc} female${disq.length ? ` | ${disq.length} disqualified (${disq.map(o=>o.name).join(', ')})` : ''}${termIssues.length ? ` | ${termIssues.length} at term limit` : ''}
Compliance gaps: ${compLine.length === 0 ? 'Fully compliant (5/5)' : compLine.join('; ')}

Write a structured governance analysis using exactly this format (each on its own line, separated by a blank line):

**Strengths & Status:** [one sentence on the strongest governance dimension and overall score]

**Critical Gap & Risk:** [one sentence on the most important compliance or governance weakness]

**Priority Action for NOCSL:** [one specific, actionable recommendation with a measurable target]

Be specific with numbers from the data.`;

  const insight = await aiAsk('You are a sports governance AI analyst for the National Olympic Committee of Sri Lanka. Provide concise, factual, actionable governance analysis. Always use the exact structured format requested — each section on its own line separated by a blank line.', prompt, 350);
  res.json({ insight });
});

// AI narrative for reports (called when generating HTML reports)
async function getAiReportNarrative(type, data) {
  if (!ai) return null;
  let prompt = '';
  if (type === 'governance') {
    prompt = `${data.scores.length + data.pending.length} NSFs, ${data.scores.length} submitted, avg score ${data.avgScore}/5.0. Green (≥4.0): ${data.green}, Amber: ${data.amber}, Red (<3.0): ${data.red}. Pending: ${data.pending.length}. Top 3: ${data.scores.slice(0,3).map(s=>s.name+' '+s.total_score.toFixed(1)).join(', ')}. Bottom 3: ${data.scores.slice(-3).map(s=>s.name+' '+s.total_score.toFixed(1)).join(', ')}.`;
  } else if (type === 'fitforlife') {
    prompt = `${data.totalParticipants} participants across ${data.byProvince.length} provinces. Avg BMI ${data.avgBmi}, Sleep ${data.avgSleep}/10, Mental wellbeing ${data.avgMental}/10, Stress ${data.avgStress}/10. Activity: ${data.actStats.sessions} sessions, ${data.actStats.hours}h logged. Top sport: ${data.bySport[0]?.sport}.`;
  } else if (type === 'injury-risk') {
    prompt = `${data.totalAth} athletes monitored. HIGH risk (ACWR>1.5): ${data.highRisk.length} athletes — ${data.highRisk.slice(0,3).map(a=>a.name+'('+a.acwr.toFixed(2)+')').join(', ')}. Caution zone: ${data.cautionRisk.length}.`;
  } else if (type === 'compliance') {
    prompt = `34 federations. Grade A: ${data.gradeA}, Grade B: ${data.gradeB}, Grade C: ${data.gradeC}. Fully compliant (5/5): ${data.fullComp}. Compliance gaps: ${data.issues}. Key issues across federations: gender quota failures, missing financial statements, outdated strategic plans.`;
  } else if (type === 'performance') {
    prompt = `Athletics Sri Lanka performance trends. ${data.athletes.length} athletes, ${data.tests.length} test records across 3 cycles (Dec 2024–Apr 2025).`;
  } else if (type === 'donor') {
    prompt = `${data.totalAthletes} athletes in programme, ${data.byProvince.length} provinces. ${data.actStats.sessions} sessions, ${data.actStats.hours}h training. Avg BMI ${data.health.avg_bmi}, mental wellbeing ${data.health.avg_mental}/10. ${data.govStats.submitted} federations submitting governance reports, avg score ${data.govStats.avg}.`;
  }
  if (!prompt) return null;
  return aiAsk(
    'You are the AI narrative engine for SLSIE reports (National Olympic Committee of Sri Lanka). Write a single executive summary paragraph of 3–4 sentences based on the data provided. Be specific, professional, and highlight the most important insight.',
    prompt, 200
  );
}

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
      const feds = db.prepare(`SELECT f.* FROM federations f ORDER BY f.name`).all();
      const YEAR = 2025;
      const federations = feds.map(f => {
        const grade = fedGrade(f.affiliated_clubs, f.annual_turnover);
        const femaleEcCount = db.prepare(
          "SELECT COUNT(*) as c FROM ec_officers WHERE federation_id=? AND gender='F' AND status='active' AND is_disqualified=0"
        ).get(f.id).c;
        const totalOfficers = db.prepare('SELECT COUNT(*) as c FROM ec_officers WHERE federation_id=? AND status=\'active\'').get(f.id).c;
        const disqualified  = db.prepare('SELECT COUNT(*) as c FROM ec_officers WHERE federation_id=? AND is_disqualified=1').get(f.id).c;
        const termIssues    = db.prepare(
          "SELECT COUNT(*) as c FROM ec_officers WHERE federation_id=? AND status='active' AND is_disqualified=0 AND ((role IN ('President','Secretary','Treasurer') AND (? - appointed_year) >= 8) OR (role NOT IN ('President','Secretary','Treasurer') AND (? - appointed_year) >= 12))"
        ).get(f.id, YEAR, YEAR).c;
        const checks = complianceChecks(f, femaleEcCount);
        return { ...f, grade, femaleEcCount, totalOfficers, disqualified, termIssues, ...checks };
      });
      const gradeA  = federations.filter(f => f.grade === 'A').length;
      const gradeB  = federations.filter(f => f.grade === 'B').length;
      const gradeC  = federations.filter(f => f.grade === 'C').length;
      const fullComp = federations.filter(f => f.complianceScore === '5/5').length;
      const issues  = federations.filter(f => f.complianceScore !== '5/5').length;
      return { today, federations, gradeA, gradeB, gradeC, fullComp, issues };
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

function generateHtmlReport(type, data, aiNarrative = null) {
  const title = REPORT_TITLES[type] || 'Report';
  const aiBox = aiNarrative
    ? `<div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1.5px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin:0 0 24px;display:flex;gap:14px;align-items:flex-start">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1d4ed8,#15803d);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;font-size:14px">✦</div>
        <div>
          <div style="font-size:8pt;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">AI Executive Summary — SLSIE Intelligence Engine</div>
          <p style="margin:0;color:#1e3a5f;line-height:1.65;font-size:10pt">${aiNarrative}</p>
        </div>
      </div>`
    : '';
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
    const { today, federations, gradeA, gradeB, gradeC, fullComp, issues } = data;
    const tick = v => v ? '✔' : '✘';
    const gb = g => g === 'A' ? '<span class="badge" style="background:#1d4ed8;color:#fff">A</span>'
                  : g === 'B' ? '<span class="badge" style="background:#b45309;color:#fff">B</span>'
                              : '<span class="badge" style="background:#64748b;color:#fff">C</span>';
    const scoreBadge = s => {
      const [p] = s.split('/').map(Number);
      const cls = p === 5 ? 'g' : p >= 3 ? 'a' : 'r';
      return `<span class="badge ${cls}">${s}</span>`;
    };
    const alertRows = federations.filter(f => !f.agmCompliant || !f.finCompliant || !f.stratCompliant || !f.genderCompliant || !f.champCompliant || f.disqualified > 0 || f.termIssues > 0);
    body = `
<div class="cover">
  <div class="cover-org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
  <div class="cover-title">${title}</div>
  <div class="cover-sub">Federation grading and statutory compliance per National Sports Associations Regulations No. 01 of 2025 (Gazette No. 2437/24)</div>
  <div class="cover-meta">Generated: ${today} &nbsp;|&nbsp; Reporting Year: 2025 &nbsp;|&nbsp; Classification: Official Use Only</div>
</div>
<div class="wrap">
  <h2>Executive Summary</h2>
  <p>This report assesses all 34 National Sports Federations (NSFs) affiliated to the National Olympic Committee of Sri Lanka (NOCSL) against the five statutory compliance requirements of the National Sports Associations Regulations No. 01 of 2025, and classifies each federation into Grade A, B, or C based on affiliated clubs and annual turnover.</p>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${federations.length}</div><div class="l">Total Federations</div></div>
    <div class="kpi" style="background:#dbeafe;border-color:#bfdbfe"><div class="v" style="color:#1d4ed8">${gradeA}</div><div class="l">Grade A</div></div>
    <div class="kpi amber"><div class="v">${gradeB}</div><div class="l">Grade B</div></div>
    <div class="kpi"><div class="v" style="color:#64748b">${gradeC}</div><div class="l">Grade C</div></div>
    <div class="kpi green"><div class="v">${fullComp}</div><div class="l">Fully Compliant (5/5)</div></div>
    <div class="kpi red"><div class="v">${issues}</div><div class="l">Compliance Gaps</div></div>
  </div>
  <h3>Federation Grading Criteria (Gazette Schedule 1)</h3>
  <table>
    <thead><tr><th>Grade</th><th>Affiliated Clubs / District Assoc.</th><th>Annual Turnover (LKR)</th></tr></thead>
    <tbody>
      <tr><td><strong>Grade A</strong></td><td>25 or more</td><td>Rs. 50 million or above</td></tr>
      <tr><td><strong>Grade B</strong></td><td>15 or more</td><td>Rs. 10 million or above</td></tr>
      <tr><td><strong>Grade C</strong></td><td>Below 15</td><td>Below Rs. 10 million</td></tr>
    </tbody>
  </table>
  ${alertRows.length ? `
  <h2>⚠ Compliance Alerts — ${alertRows.length} Federations Require Action</h2>
  <table>
    <thead><tr><th>Federation</th><th>Grade</th><th>Issue(s) Identified</th></tr></thead>
    <tbody>${alertRows.map(f => {
      const issues = [];
      if (!f.agmCompliant)    issues.push('AGM not recorded for 2025');
      if (!f.finCompliant)    issues.push('Financial statements not submitted for 2025');
      if (!f.stratCompliant)  issues.push('No current strategic plan on record');
      if (!f.genderCompliant) issues.push(`Gender quota not met (${f.femaleEcCount} female EC officer${f.femaleEcCount!==1?'s':''})`);
      if (!f.champCompliant)  issues.push('National championship not recorded for 2025');
      if (f.disqualified > 0) issues.push(`${f.disqualified} disqualified officer(s) on register`);
      if (f.termIssues > 0)   issues.push(`${f.termIssues} officer(s) exceeding term limit`);
      return `<tr><td><strong>${f.name}</strong></td><td>${gb(f.grade)}</td><td style="color:#b91c1c">${issues.join('; ')}</td></tr>`;
    }).join('')}</tbody>
  </table>` : ''}
  <h2>Full Compliance Matrix</h2>
  <table>
    <thead><tr><th>Federation</th><th>Sport</th><th>Grade</th><th>Clubs</th><th>Turnover</th><th>AGM</th><th>Fin. Stmt</th><th>Strat. Plan</th><th>Gender ≥2F</th><th>Nat. Champ.</th><th>EC Officers</th><th>Score</th></tr></thead>
    <tbody>${federations.map(f => `<tr>
      <td><strong>${f.name}</strong></td>
      <td>${f.sport}</td>
      <td>${gb(f.grade)}</td>
      <td>${f.affiliated_clubs || '—'}</td>
      <td>${f.annual_turnover ? 'Rs.'+((f.annual_turnover/1000000).toFixed(1))+'M' : '—'}</td>
      <td style="color:${f.agmCompliant?'#15803d':'#b91c1c'};font-weight:700">${tick(f.agmCompliant)}</td>
      <td style="color:${f.finCompliant?'#15803d':'#b91c1c'};font-weight:700">${tick(f.finCompliant)}</td>
      <td style="color:${f.stratCompliant?'#15803d':'#b91c1c'};font-weight:700">${tick(f.stratCompliant)}</td>
      <td style="color:${f.genderCompliant?'#15803d':'#b91c1c'};font-weight:700">${tick(f.genderCompliant)} ${f.femaleEcCount>0?'('+f.femaleEcCount+'F)':''}</td>
      <td style="color:${f.champCompliant?'#15803d':'#b91c1c'};font-weight:700">${tick(f.champCompliant)}</td>
      <td style="font-size:8.5pt">${f.totalOfficers} total${f.disqualified?', <span style="color:#b91c1c">'+f.disqualified+' disq.</span>':''}${f.termIssues?' <span style="color:#b45309">'+f.termIssues+' term</span>':''}</td>
      <td>${scoreBadge(f.complianceScore)}</td>
    </tr>`).join('')}</tbody>
  </table>
  <div class="note"><strong>Compliance Requirements (Gazette No. 2437/24):</strong> (1) Annual General Meeting held in the reporting year; (2) Audited financial statements submitted within 2 months of year-end; (3) Strategic plan for the current or preceding year in force; (4) Minimum 2 female members on the Executive Committee where female athletes participate; (5) National championship conducted in the reporting year.</div>
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

  // Inject AI narrative box after the first <div class="wrap"> opening
  const bodyWithAi = aiBox ? body.replace('<div class="wrap">', `<div class="wrap">${aiBox}`) : body;
  return reportHtmlPage(title, bodyWithAi);
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
    const { federations, gradeA, gradeB, gradeC, fullComp, issues } = data;
    const tick = v => v ? '✔' : '✘';
    children.push(h1('Federation Compliance Report 2025'));
    children.push(para(`Assessment of all 34 NSFs against the National Sports Associations Regulations No. 01 of 2025 (Gazette No. 2437/24). Grade A: ${gradeA}  |  Grade B: ${gradeB}  |  Grade C: ${gradeC}  |  Fully Compliant (5/5): ${fullComp}  |  Compliance Gaps: ${issues}`));

    // Grading criteria table
    children.push(h2('Federation Grading Criteria (Gazette Schedule 1)'));
    const gc = [2000, 3500, 3500];
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, columnWidths: gc, rows: [
      new TableRow({ tableHeader: true, children: ['Grade','Affiliated Clubs / District Assoc.','Annual Turnover (LKR)'].map((h,i)=>hdrCell(h,gc[i])) }),
      new TableRow({ children: [dataCell('Grade A',gc[0],{bold:true}), dataCell('25 or more',gc[1]), dataCell('Rs. 50 million or above',gc[2])] }),
      new TableRow({ children: [dataCell('Grade B',gc[1],{bold:true}), dataCell('15 or more',gc[1]), dataCell('Rs. 10 million or above',gc[2])] }),
      new TableRow({ children: [dataCell('Grade C',gc[2],{bold:true}), dataCell('Below 15',gc[1]), dataCell('Below Rs. 10 million',gc[2])] }),
    ]}));

    // Alert table — only federations with issues
    const alertFeds = federations.filter(f => f.complianceScore !== '5/5' || f.disqualified > 0 || f.termIssues > 0);
    if (alertFeds.length) {
      children.push(h1(`Compliance Alerts — ${alertFeds.length} Federations`));
      const ac = [2800, 800, 5400];
      children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, columnWidths: ac, rows: [
        new TableRow({ tableHeader: true, children: ['Federation','Grade','Issues Identified'].map((h,i)=>hdrCell(h,ac[i])) }),
        ...alertFeds.map(f => {
          const issueList = [];
          if (!f.agmCompliant)    issueList.push('AGM not recorded for 2025');
          if (!f.finCompliant)    issueList.push('Financial statements not submitted');
          if (!f.stratCompliant)  issueList.push('No current strategic plan');
          if (!f.genderCompliant) issueList.push(`Gender quota not met (${f.femaleEcCount}F)`);
          if (!f.champCompliant)  issueList.push('National championship not recorded');
          if (f.disqualified > 0) issueList.push(`${f.disqualified} disqualified officer(s)`);
          if (f.termIssues > 0)   issueList.push(`${f.termIssues} officer(s) exceeding term limit`);
          return new TableRow({ children: [
            dataCell(f.name, ac[0], {bold:true}),
            dataCell(f.grade, ac[1], {bold:true, color: f.grade==='A'?'1D4ED8':f.grade==='B'?'B45309':'64748B'}),
            dataCell(issueList.join('; '), ac[2], {color:'B91C1C'}),
          ]});
        })
      ]}));
    }

    // Full compliance matrix
    children.push(h1('Full Compliance Matrix'));
    const fc = [2000, 1000, 600, 700, 900, 650, 650, 650, 650, 650, 850];
    children.push(new Table({ width: { size: 9300, type: WidthType.DXA }, columnWidths: fc, rows: [
      new TableRow({ tableHeader: true, children: ['Federation','Sport','Grade','Clubs','Turnover','AGM','Fin.Stmt','Strategy','Gender','Champ.','Score'].map((h,i)=>hdrCell(h,fc[i])) }),
      ...federations.map(f => new TableRow({ children: [
        dataCell(f.name, fc[0], {bold:true}),
        dataCell(f.sport, fc[1]),
        dataCell(f.grade, fc[2], {bold:true, color: f.grade==='A'?'1D4ED8':f.grade==='B'?'B45309':'64748B'}),
        dataCell(f.affiliated_clubs||'—', fc[3]),
        dataCell(f.annual_turnover ? 'Rs.'+(f.annual_turnover/1000000).toFixed(1)+'M' : '—', fc[4]),
        dataCell(tick(f.agmCompliant),    fc[5], {bold:true, color: f.agmCompliant   ?'15803D':'B91C1C'}),
        dataCell(tick(f.finCompliant),    fc[6], {bold:true, color: f.finCompliant   ?'15803D':'B91C1C'}),
        dataCell(tick(f.stratCompliant),  fc[7], {bold:true, color: f.stratCompliant ?'15803D':'B91C1C'}),
        dataCell(tick(f.genderCompliant), fc[8], {bold:true, color: f.genderCompliant?'15803D':'B91C1C'}),
        dataCell(tick(f.champCompliant),  fc[9], {bold:true, color: f.champCompliant ?'15803D':'B91C1C'}),
        dataCell(f.complianceScore, fc[10], {bold:true, color: f.complianceScore==='5/5'?'15803D':parseInt(f.complianceScore)>=3?'B45309':'B91C1C'}),
      ]}))
    ]}));
    children.push(para('Compliance Requirements: (1) Annual General Meeting in 2025; (2) Audited financial statements for 2025; (3) Current strategic plan; (4) ≥2 female EC members; (5) National championship conducted in 2025.'));
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

app.get('/reports/html/:type', auth, async (req, res) => {
  const type = req.params.type;
  if (!REPORT_TITLES[type]) return res.status(404).send('Unknown report type');
  try {
    const data = getReportData(type);
    const narrative = await getAiReportNarrative(type, data);
    const html = generateHtmlReport(type, data, narrative);
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
