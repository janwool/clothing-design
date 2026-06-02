module.exports = function serveStatic() {
  return function noopStatic(req, res, next) {
    if (typeof next === 'function') next();
  };
};
