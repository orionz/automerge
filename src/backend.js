
let defaultBackend = null;

function setDefaultBackend(backend) {
  defaultBackend = backend;
}

function getDefaultBackend() {
  return defaultBackend || require('../backend')
}

module.exports = {
  getDefaultBackend, setDefaultBackend
}
