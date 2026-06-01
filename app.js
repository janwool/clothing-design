require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const db = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
async function initAppTables() {
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (err) {
    console.error('Failed to init app tables:', err.message);
  }
}
initAppTables();

// i18next setup
i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    backend: {
      loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json')
    },
    detection: {
      order: ['querystring', 'cookie', 'header'],
      caches: ['cookie']
    }
  });

// Middleware
app.use(middleware.handle(i18next));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'clothing-design-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Set i18next in locals for views
app.use((req, res, next) => {
  res.locals.i18next = req.i18n;
  res.locals.user = req.session.user || null;
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found', page: '' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Error', page: '' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
