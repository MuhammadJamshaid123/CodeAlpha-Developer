const path = require('path');
const { createRequire } = require('module');

function getSessionMiddleware({ secret, projectDir, cookieSameSite, maxAge = 86400000 }) {
  const req = createRequire(path.join(projectDir, 'package.json'));
  const session = req('express-session');

  const config = {
    secret: process.env.SESSION_SECRET || secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge,
      secure: process.env.NODE_ENV === 'production',
      sameSite: cookieSameSite || 'lax'
    }
  };

  if (process.env.DATABASE_URL) {
    const pgSession = req('connect-pg-simple')(session);
    config.store = new pgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  return session(config);
}

module.exports = { getSessionMiddleware };
