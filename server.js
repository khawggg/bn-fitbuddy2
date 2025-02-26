require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// MySQL Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// API Routes
app.get("/", (req, res) => {
    res.send("API is working!");
});

// User Registration
app.post('/register', async (req, res) => {
    const { name, age, gender, phone, email, password } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const sql = 'INSERT INTO users (name, age, gender, phone, email, password) VALUES (?, ?, ?, ?, ?, ?)';
        await db.query(sql, [name, age, gender, phone, email, hashedPassword]);
        res.send('Registration successful');
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Registration failed');
    }
});

// User Login
app.post('/login', async (req, res) => {
    const { name, password } = req.body;
    try {
        const [users] = await db.query('SELECT user_id, password FROM users WHERE name = ?', [name]);
        if (users.length === 0) return res.status(401).send('Invalid credentials');

        const passwordMatch = await bcrypt.compare(password, users[0].password);
        if (!passwordMatch) return res.status(401).send('Invalid credentials');
        
        res.json({ userId: users[0].user_id, message: 'Login successful' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Login failed');
    }
});

// Fetch User Profile
app.get('/api/profile/:user_id', async (req, res) => {
    try {
        const userId = req.params.user_id;
        const query = `
            SELECT u.user_id, u.name, u.age, u.gender, u.email, ha.weight, ha.height, ha.bmi,
                   GROUP_CONCAT(DISTINCT d.name SEPARATOR ', ') AS diseases
            FROM users u
            LEFT JOIN health_assessment ha ON u.user_id = ha.user_id
            LEFT JOIN user_diseases ud ON u.user_id = ud.user_id
            LEFT JOIN diseases d ON ud.disease_id = d.disease_id
            WHERE u.user_id = ?
            GROUP BY u.user_id, u.name, u.age, u.gender, u.email, ha.weight, ha.height, ha.bmi;
        `;
        const [results] = await db.query(query, [userId]);
        if (results.length === 0) return res.status(404).send('User not found');
        res.json(results[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('Database error');
    }
});

// Update User Profile
app.put('/api/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, age, gender, phone, email } = req.body;
        const sql = 'UPDATE users SET name = ?, age = ?, gender = ?, phone = ?, email = ? WHERE user_id = ?';
        const [result] = await db.query(sql, [name, age, gender, phone, email, userId]);
        if (result.affectedRows === 0) return res.status(404).send('User not found');
        res.send('User updated successfully');
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).send('Update failed');
    }
});

// Delete User
app.delete('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [result] = await db.query('DELETE FROM users WHERE user_id = ?', [userId]);
        if (result.affectedRows === 0) return res.status(404).send('User not found');
        res.send('User deleted successfully');
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).send('Deletion failed');
    }
});

// Get BMI Data
app.get('/getUserBMI', async (req, res) => {
    try {
        const sql = 'SELECT u.user_id, u.name, h.bmi FROM health_assessment h JOIN users u ON h.user_id = u.user_id';
        const [results] = await db.query(sql);
        res.json(results);
    } catch (error) {
        console.error('Error fetching BMI:', error);
        res.status(500).send('Failed to fetch BMI data');
    }
});
