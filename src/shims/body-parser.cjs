function noopMiddleware(req, res, next) {
  if (typeof next === 'function') next();
}

function createNoopParser() {
  return noopMiddleware;
}

function bodyParser() {
  return noopMiddleware;
}

bodyParser.json = createNoopParser;
bodyParser.raw = createNoopParser;
bodyParser.text = createNoopParser;
bodyParser.urlencoded = createNoopParser;

module.exports = bodyParser;
