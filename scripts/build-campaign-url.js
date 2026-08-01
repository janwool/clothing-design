const { buildCampaignUrl } = require('../lib/campaign-url');

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    const nextValue = inlineValue === undefined ? values[index + 1] : inlineValue;
    if (inlineValue === undefined) index += 1;
    options[rawKey] = nextValue;
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  process.stdout.write(`${buildCampaignUrl(options)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.stderr.write('Usage: npm run campaign:url -- --url /tools/t-shirt-mockup-generator --source pinterest --campaign august-tshirt --content pin-01\n');
  process.exitCode = 1;
}
