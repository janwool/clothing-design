module.exports = function applyIconvLiteNodeExtension(iconv) {
  if (iconv) {
    iconv.supportsStreams = false;
  }
};
