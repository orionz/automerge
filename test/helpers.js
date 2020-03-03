const assert = require('assert')

const Automerge = require("../src/automerge")
const WASM_PATH = process.env.WASM_BACKEND_PATH
if (!WASM_PATH) throw "Undefined WASM_BACKEND_PATH"
const Backend = require(WASM_PATH)
Automerge.setDefaultBackend(Backend)

// Assertion that succeeds if the first argument deepEquals at least one of the
// subsequent arguments (but we don't care which one)
function assertEqualsOneOf(actual, ...expected) {
  assert(expected.length > 0)
  for (let i = 0; i < expected.length; i++) {
    try {
      assert.deepEqual(actual, expected[i])
      return // if we get here without an exception, that means success
    } catch (e) {
      if (!e.name.match(/^AssertionError/) || i === expected.length - 1) throw e
    }
  }
}

module.exports = { assertEqualsOneOf }
