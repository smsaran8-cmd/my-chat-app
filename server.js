const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bcrypt = require('bcryptjs');
const session = require('express-session');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname + '/public'));

app.use(session({
    secret: 'supersecretkey',
    resave: false,
    saveUninitialized: true
}));

// In-Memory Database to store extended user profile details
const usersDB = {}; 

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Register with full profile details
app.post('/register', async (req, res) => {
    const { username, password, age, dob, sex, location } = req.body;
    
    if (usersDB[username]) {
        return res.json({ success: false, message: 'Username is already taken!' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Saving all profile details
    usersDB[username] = {
        password: hashedPassword,
        age,
        dob,
        sex,
        location
    };

    res.json({ success: true, message: 'Registration Successful! Please Login.' });
});

// Login Route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = usersDB[username];
    
    if (!user) {
        return res.json({ success: false, message: 'User not found! Please Register first.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
        res.json({ success: true, username: username, profile: user });
    } else {
        res.json({ success: false, message: 'Incorrect Password!' });
    }
});

// Real-time Chat Socket Connection
io.on('connection', (socket) => {
    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });
});

const PORT = 80;
http.listen(PORT, () => {
    console.log(`🚀 Profile-Based Chat App running at http://localhost:${PORT}`);
});