require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const { processCampaignQueue } = require('../lib/admin-email-campaigns');
processCampaignQueue().then(() => console.log('Email queue processed.')).catch(error => {
  console.error('Email queue could not be processed:', error.message);
  process.exitCode = 1;
});
