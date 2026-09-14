require('dotenv').config({ path: ['.env.local', '.env'] });

const app = require('./app-core');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
