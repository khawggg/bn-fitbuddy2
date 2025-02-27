const http = require('http');
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const hostname = '127.0.0.1';
require('dotenv').config();


const app = express();
const port = 3000;

// Middleware
app.use(cors()); 
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());
app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});


// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    user: process.env.DB_USER || '4KhA7MfZkdHo6df.root',
    password: process.env.DB_PASS || 'QZxt5AxGwZsfXCGA',
    database: process.env.DB_NAME || 'fit_buddy',
    ssl: { rejectUnauthorized: true }, // Required for TiDB Cloud SSL
    
});


db.connect((err) => {
    if (err) {
        console.error('❌ MySQL connection error:', err);
    } else {
        console.log('✅ Connected to MySQL');
    }
});


app.get("/", (req, res) => {
    res.send("API is working!");
});
// API endpoint to get user profile data by user_id
app.get('/api/profile/:user_id', (req, res) => {
    const userId = req.params.user_id;

    const query = `
    SELECT 
        u.user_id,
        u.name,
        u.age,
        u.gender,
        u.email,
        ha.weight,
        ha.height,
        ha.bmi,
        GROUP_CONCAT(DISTINCT d.name SEPARATOR ', ') AS diseases,
        GROUP_CONCAT(DISTINCT ud.exercise_type SEPARATOR ', ') AS exercise_types,
        GROUP_CONCAT(DISTINCT ud.detailed_guideline SEPARATOR ', ') AS detailed_guidelines
    FROM users u
    LEFT JOIN health_assessment ha ON u.user_id = ha.user_id
    LEFT JOIN user_diseases ud ON u.user_id = ud.user_id
    LEFT JOIN diseases d ON ud.disease_id = d.disease_id
    WHERE u.user_id = ?
    GROUP BY u.user_id, u.name, u.age, u.gender, u.email, ha.weight, ha.height, ha.bmi;
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error querying the database: ' + err.stack);
            res.status(500).send('Database error');
            return;
        }

        if (results.length > 0) {
            res.json(results[0]);
        } else {
            res.status(404).send('User not found');
        }
    });
});

app.post('/user-disease', (req, res) => {
    const { userId, diseaseId } = req.body;
    // ดึงข้อมูลโรคจากตาราง diseases
    const getDiseaseSQL = `
        SELECT name, description, exercise_type, detailed_guideline
        FROM diseases WHERE disease_id = ?
    `;
    db.query(getDiseaseSQL, [diseaseId], (err, diseaseResult) => {
        if (err) {
            console.error('Error fetching disease data:', err);
            return res.status(500).send('Failed to fetch disease data');
        }
        if (diseaseResult.length === 0) {
            return res.status(404).send('Disease not found');
        }
        const { name, description, exercise_type, detailed_guideline } = diseaseResult[0];
        // บันทึกข้อมูลโรคลงใน user_diseases
        const insertSQL = `
            INSERT INTO user_diseases (user_id, disease_id, name, description, exercise_type, detailed_guideline)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.query(insertSQL, [userId, diseaseId, name, description, exercise_type, detailed_guideline], (err, result) => {
            if (err) {
                console.error('User-disease association error:', err);
                return res.status(500).send('Failed to associate user with disease');
            }
            res.send('User-disease association successful');
        });
    });
});

app.get('/api/profile/:userId', (req, res) => {
    const userId = req.params.userId;
    
    // สมมุติว่าเรามีฟังก์ชัน getUserProfile ที่ดึงข้อมูลจากฐานข้อมูล
    getUserProfile(userId)
        .then(profile => {
            if (!profile) {
                return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้' });
            }
            res.json(profile);
        })
        .catch(error => {
            console.error(error);
            res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
        });
});
app.put('/api/users/:userId', (req, res) => {
    const userId = req.params.userId;
    const { name, age, gender, phone, email } = req.body;

    // สมมุติว่าเรามีฟังก์ชัน updateUserProfile ที่อัปเดตข้อมูลในฐานข้อมูล
    updateUserProfile(userId, { name, age, gender, phone, email })
        .then(result => {
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'ไม่พบผู้ใช้ที่ต้องการอัปเดต' });
            }
            res.json({ message: 'อัปเดตข้อมูลสำเร็จ' });
        })
        .catch(error => {
            console.error(error);
            res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' });
        });
});


// Routes
// 1. Registration
app.post('/register', async (req, res) => { // เพิ่ม async
    const { name, age, gender, phone, email, password } = req.body;
    try {
        // สร้าง salt
        const salt = await bcrypt.genSalt(10);
        // Hash รหัสผ่าน
        const hashedPassword = await bcrypt.hash(password, salt);

        const sql = 'INSERT INTO users (name, age, gender, phone, email, password) VALUES (?, ?, ?, ?, ?, ?)';
        db.query(sql, [name, age, gender, phone, email, hashedPassword], (err, result) => {
            if (err) {
                console.error('Registration error:', err);
                return res.status(500).send('Registration failed');
            }
            res.send('Registration successful');
        });
    } catch (error) {
        console.error('Error hashing password:', error);
        res.status(500).send('Registration failed');
    }
});

// 2. Login
app.post('/login', async (req, res) => { // เพิ่ม async
    const { name, password } = req.body;
    const sql = 'SELECT user_id, password AS hashedPassword FROM users WHERE name = ?'; // ดึง hashedPassword
    db.query(sql, [name], async (err, result) => { // เพิ่ม async
        if (err) {
            console.error('Login error:', err);
            return res.status(500).send('Login failed');
        }

        if (result.length > 0) {
            const hashedPasswordFromDB = result[0].hashedPassword;

            // เปรียบเทียบรหัสผ่าน
            const passwordMatch = await bcrypt.compare(password, hashedPasswordFromDB);

            if (passwordMatch) {
                res.send({ userId: result[0].user_id, message: 'Login successful' });
            } else {
                res.status(401).send('Invalid credentials');
            }
        } else {
            res.status(401).send('Invalid credentials');
        }
    });
});


// 3. BMI Calculation and Storage
app.post('/bmi', (req, res) => {
    const { userId, weight, height, bmi } = req.body;
    const sql = 'INSERT INTO health_assessment (user_id, weight, height, bmi) VALUES (?, ?, ?, ?)';
    db.query(sql, [userId, weight, height, bmi], (err, result) => {
        if (err) {
            console.error('BMI storage error:', err);
            res.status(500).send('BMI storage failed');
        } else {
            res.send('BMI calculated and stored successfully');
        }
    });
});


// 4. Disease Information Retrieval and Association
app.get('/diseases', (req, res) => {
    const sql = 'SELECT disease_id, name FROM diseases';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Disease retrieval error:', err);
            res.status(500).send('Failed to retrieve diseases');
        } else {
            res.json(results);
        }
    });
});

app.get('/disease/:diseaseId', (req, res) => {
    const diseaseId = req.params.diseaseId;
    const sql = 'SELECT * FROM diseases WHERE disease_id = ?';
    db.query(sql, [diseaseId], (err, results) => {
        if (err) {
            console.error('Disease details retrieval error:', err);
            res.status(500).send('Failed to retrieve disease details');
        } else {
            res.json(results[0]);
        }
    });
});

app.post('/user-disease', (req, res) => {
    const { userId, diseaseId } = req.body;

    // ดึงข้อมูลโรคจากตาราง diseases
    const getDiseaseSQL = `SELECT name, description, exercise_type, detailed_guideline 
                           FROM diseases WHERE disease_id = ?`;

    db.query(getDiseaseSQL, [diseaseId], (err, diseaseResult) => {
        if (err) {
            console.error('Error fetching disease data:', err);
            return res.status(500).send('Failed to fetch disease data');
        }
        
        if (diseaseResult.length === 0) {
            return res.status(404).send('Disease not found');
        }

        const { name, description, exercise_type, detailed_guideline } = diseaseResult[0];

        // บันทึกข้อมูลโรคลงใน user_diseases
        const insertSQL = `INSERT INTO user_diseases (user_id, disease_id, name, description, exercise_type, detailed_guideline)
                           VALUES (?, ?, ?, ?, ?, ?)`;

        db.query(insertSQL, [userId, diseaseId, name, description, exercise_type, detailed_guideline], (err, result) => {
            if (err) {
                console.error('User-disease association error:', err);
                return res.status(500).send('Failed to associate user with disease');
            }
            res.send('User-disease association successful');
        });
    });
});




// ดึงข้อมูลผู้ใช้ทั้งหมด
app.get('/users', (req, res) => {
  const sql = 'SELECT user_id, name, age, gender, phone, email FROM users';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      res.status(500).send('Failed to fetch users');
    } else {
      res.json(results);
    }
  });
});

// ลบผู้ใช้
app.delete('/users/:userId', (req, res) => {
  const userId = req.params.userId;
  const sql = 'DELETE FROM users WHERE user_id = ?';
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error('Error deleting user:', err);
      res.status(500).send('Failed to delete user');
    } else {
      res.send('User deleted successfully');
    }
  });
});

// แก้ไขข้อมูลผู้ใช้
app.put('/users/:userId', (req, res) => {
    const userId = req.params.userId;
    const { name, age, gender, phone, email } = req.body;
    const sql = 'UPDATE users SET name = ?, age = ?, gender = ?, phone = ?, email = ? WHERE user_id = ?';
    
    console.log('Updating user:', userId, req.body); // เพิ่ม log เพื่อตรวจสอบข้อมูล
    
    db.query(sql, [name, age, gender, phone, email, userId], (err, result) => {
      if (err) {
        console.error('Error updating user:', err);
        res.status(500).send('Failed to update user');
      } else if (result.affectedRows === 0) {
        res.status(404).send('User not found');
      } else {
        res.send('User updated successfully');
      }
    });
});

app.post('/users', (req, res) => {
    const { name, age, gender, phone, email ,password} = req.body;
    const sql = 'INSERT INTO users (name, age, gender, phone, email,password) VALUES (?, ?, ?, ?, ? ,?)';
    
    db.query(sql, [name, age, gender, phone, email,password], (err, result) => {
      if (err) {
        console.error('Error creating user:', err);
        res.status(500).send('Failed to create user');
      } else {
        res.status(201).send('User created successfully');
      }
    });
});

app.get('/getUserBMI', (req, res) => {
    const userId = req.query.userId;
    const sql = 'SELECT  u.user_id , u_name , h.bmi FROM health_assessment h JOIN users u ON h.user_id = u.user_id ';
    
    db.query(sql, [userId], (err, results) => {
      if (err) {
        console.error('Error fetching BMI data:', err);
        res.status(500).send('Failed to fetch BMI data');
      } else {
        res.json(results);
      }
    });
});
  
app.get("/users/:id", (req, res) => {
    const userId = req.params.id;
    db.query("SELECT * FROM users WHERE user_id = ?", [userId], (err, results) => {
        if (err) {
            console.error("❌ Error fetching user:", err);
            res.status(500).json({ error: "Internal Server Error" });
        } else {
            if (results.length > 0) {
                res.json(results);  // ส่งข้อมูลของ user ตาม ID
            } else {
                res.status(404).json({ error: "User not found" });  // กรณีที่ไม่พบ user
            }
        }
    });
});
