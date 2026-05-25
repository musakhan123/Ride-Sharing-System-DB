const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'ride-sharing-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Routes
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const driverRouter = require('./routes/driver');
const passengerRouter = require('./routes/passenger');
const reviewsRouter = require('./routes/reviews');

app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/driver', driverRouter);
app.use('/passenger', passengerRouter);
app.use('/reviews', reviewsRouter);

db.getConnection()
  .then(conn => {
    console.log('MySQL connected successfully');
    conn.release();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MySQL connection failed:', err.message);
    process.exit(1);
  });
