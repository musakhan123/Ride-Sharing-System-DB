const http    = require('http');
const express = require('express');
const session = require('express-session');
const path    = require('path');
const db      = require('./config/db');
const { init: initSocket } = require('./config/socket');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SESSION_SECRET = process.env.SESSION_SECRET || 'ride-sharing-secret-key';
if (!process.env.SESSION_SECRET) {
  console.warn('[WARN] SESSION_SECRET env var not set — using insecure default. Set it in production.');
}

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000   // 24 hours
  }
}));

// Socket.io
initSocket(server);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Routes
const indexRouter     = require('./routes/index');
const authRouter      = require('./routes/auth');
const driverRouter    = require('./routes/driver');
const passengerRouter = require('./routes/passenger');
const reviewsRouter   = require('./routes/reviews');
const adminRouter     = require('./routes/admin');
const profileRouter   = require('./routes/profile');

app.use('/',          indexRouter);
app.use('/admin',     adminRouter);
app.use('/auth',      authRouter);
app.use('/driver',    driverRouter);
app.use('/passenger', passengerRouter);
app.use('/reviews',   reviewsRouter);
app.use('/profile',   profileRouter);

// Express error handling middleware
app.use((err, req, res, next) => {
  console.error('[Express Error]', err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  if (req.accepts('html')) {
    return res.status(status).send(
      `<h2>Something went wrong</h2><p>${err.message || 'Internal server error'}</p>`
    );
  }
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// Keep the process alive on unexpected errors
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});

db.getConnection()
  .then(conn => {
    console.log('MySQL connected successfully');
    conn.release();
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MySQL connection failed:', err.message);
    process.exit(1);
  });
