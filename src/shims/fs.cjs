class Stats {
  isFile() {
    return false;
  }

  isDirectory() {
    return false;
  }
}

class ReadStream {}

function createFsError(method) {
  const err = new Error(`fs.${method} is not available in the Worker runtime`);
  err.code = 'ENOENT';
  return err;
}

function statSync() {
  throw createFsError('statSync');
}

function readFileSync() {
  throw createFsError('readFileSync');
}

function createReadStream() {
  throw createFsError('createReadStream');
}

module.exports = {
  Stats,
  ReadStream,
  createReadStream,
  existsSync: () => false,
  readFileSync,
  statSync,
  promises: {}
};
