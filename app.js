require('dotenv').config({ path: ['.env.local', '.env'] });

const app = require('./app-core');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const { processCampaignQueue } = require('./lib/admin-email-campaigns');
const processEmails = () => processCampaignQueue().catch(() => console.error('Email queue processing failed; saved records remain available for retry.'));
processEmails();
setInterval(processEmails, 60000).unref();
