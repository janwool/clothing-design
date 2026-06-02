module.exports = function createNoopDeprecator() {
  function deprecate() {}

  deprecate.function = function passthrough(fn) {
    return typeof fn === 'function' ? fn : function noop() {};
  };

  deprecate.property = function noopProperty() {};

  return deprecate;
};
