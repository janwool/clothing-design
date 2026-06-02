const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../lib/db');
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';

// Initialize database
async function initAuthTables() {
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (err) {
    console.error('Failed to init auth tables:', err.message);
  }
}
if (!isWorkerRuntime) {
  initAuthTables();
}

// Login page
router.get('/login', (req, res) => {
  res.render('auth/login', { 
    title: req.t('auth.login'),
    page: 'login'
  });
});

// Register page
router.get('/register', (req, res) => {
  res.render('auth/register', { 
    title: req.t('auth.register'),
    page: 'register'
  });
});

// Login POST
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      return res.render('auth/login', { 
        error: req.t('auth.invalidCredentials'),
        title: req.t('auth.login'),
        page: 'login'
      });
    }
    
    bcrypt.compare(password, user.password, (err, match) => {
      if (match) {
        req.session.user = {
          id: user.id,
          email: user.email,
          name: user.name
        };
        res.redirect('/');
      } else {
        res.render('auth/login', { 
          error: req.t('auth.invalidCredentials'),
          title: req.t('auth.login'),
          page: 'login'
        });
      }
    });
  } catch (err) {
    res.render('auth/login', { 
      error: req.t('auth.error'),
      title: req.t('auth.login'),
      page: 'login'
    });
  }
});

// Register POST
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    bcrypt.hash(password, 10, async (err, hash) => {
      if (err) {
        return res.render('auth/register', { 
          error: req.t('auth.error'),
          title: req.t('auth.register'),
          page: 'register'
        });
      }
      
      try {
        const result = await db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', 
          [email, hash, name]
        );
        
        req.session.user = {
          id: result.lastID,
          email,
          name
        };
        res.redirect('/');
      } catch (err) {
        res.render('auth/register', { 
          error: req.t('auth.emailExists'),
          title: req.t('auth.register'),
          page: 'register'
        });
      }
    });
  } catch (err) {
    res.render('auth/register', { 
      error: req.t('auth.error'),
      title: req.t('auth.register'),
      page: 'register'
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
