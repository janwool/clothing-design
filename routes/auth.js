const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../lib/db');
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';
const { pageStructuredData } = require('../lib/seo');

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

function buildAuthPageData(req, page, title) {
  const path = page === 'register' ? '/auth/register' : '/auth/login';
  const description = page === 'register'
    ? 'Create a ClothingDesign account for sign-in access while the browser mockup workspace is in public beta.'
    : 'Sign in to ClothingDesign, or continue into the public browser mockup workspace without an account.';

  return {
    title,
    page,
    metaDescription: description,
    metaImage: 'https://cdn.cloz-design.com/site/icon.png',
    metaRobots: 'noindex,follow',
    structuredData: pageStructuredData(req, {
      type: 'WebPage',
      name: title,
      description,
      path,
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: title, url: path }
      ]
    })
  };
}

// Login page
router.get('/login', (req, res) => {
  res.render('auth/login', buildAuthPageData(req, 'login', req.t('auth.login')));
});

// Register page
router.get('/register', (req, res) => {
  res.render('auth/register', buildAuthPageData(req, 'register', req.t('auth.register')));
});

// Login POST
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      return res.render('auth/login', { 
        ...buildAuthPageData(req, 'login', req.t('auth.login')),
        error: req.t('auth.invalidCredentials'),
      });
    }
    
    bcrypt.compare(password, user.password, (err, match) => {
      if (match) {
        req.session.user = {
          id: user.id,
          email: user.email,
          name: user.name
        };
        res.redirect('/tools/t-shirt-mockup-generator');
      } else {
        res.render('auth/login', { 
          ...buildAuthPageData(req, 'login', req.t('auth.login')),
          error: req.t('auth.invalidCredentials'),
        });
      }
    });
  } catch (err) {
    res.render('auth/login', { 
      ...buildAuthPageData(req, 'login', req.t('auth.login')),
      error: req.t('auth.error'),
    });
  }
});

// Register POST
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (String(name || '').trim().length < 2) {
      return res.render('auth/register', {
        ...buildAuthPageData(req, 'register', req.t('auth.register')),
        error: 'Please enter your name.'
      });
    }
    if (String(password || '').length < 8) {
      return res.render('auth/register', {
        ...buildAuthPageData(req, 'register', req.t('auth.register')),
        error: 'Use a password with at least 8 characters.'
      });
    }
    
    bcrypt.hash(password, 10, async (err, hash) => {
      if (err) {
        return res.render('auth/register', { 
          ...buildAuthPageData(req, 'register', req.t('auth.register')),
          error: req.t('auth.error'),
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
        res.redirect('/tools/t-shirt-mockup-generator');
      } catch (err) {
        res.render('auth/register', { 
          ...buildAuthPageData(req, 'register', req.t('auth.register')),
          error: req.t('auth.emailExists'),
        });
      }
    });
  } catch (err) {
    res.render('auth/register', { 
      ...buildAuthPageData(req, 'register', req.t('auth.register')),
      error: req.t('auth.error'),
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
