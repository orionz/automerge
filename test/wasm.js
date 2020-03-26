global.wasm = true
const Automerge = require("../src/automerge")
const WASM_PATH = process.env.WASM_BACKEND_PATH
if (!WASM_PATH) throw "Undefined WASM_BACKEND_PATH"
const Backend = require(WASM_PATH)
Automerge.setDefaultBackend(Backend)
