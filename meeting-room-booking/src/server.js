'use strict';
const { getDb }     = require('./db/database');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

getDb().then(db => {
  const app = createApp(db);
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}).catch(err => { console.error(err); process.exit(1); });
