const assert = require('assert')
const WASM_PATH = process.env.WASM_BACKEND_PATH
if (!WASM_PATH)  {
  return
}
const WasmBackend = require(WASM_PATH)
const JsBackend = require('../backend')
const seedrandom = require('seedrandom')
const Frontend = require('../frontend')

function pick( list ) {
  if (list.length === 0) return undefined
  return list[ RAND() % list.length]
}

function shuffle(a,b) {
  if (RAND() % 2 === 0) {
    return [a,b]
  } else {
    return [b,a]
  }
}

function seed() {
  let _seed;
  if (process.env.SEED) {
    _seed = parseInt(process.env.SEED)
    console.log(`Using env $SEED=${_seed}`)
  } else {
    _seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
    console.log(`Running random seed ${_seed}`)
  }
  let _r = seedrandom(_seed).int32
  RAND = () => Math.abs(_r())
}

let RAND = seedrandom().int32;

function bool() {
  return (RAND() % 2 === 0)
}

function key(obj) {
  if (obj) {
    return pick(Object.keys(obj))
  } else {
    return `k${ RAND().toString(16) }`
  }
}

function value() {
  return RAND().toString(16)
}

function at(obj, path) {
  if (path == "/") return obj
  let steps = path.split("/").slice(1,-1)
  for (let i = 0; i < steps.length; i++) {
    obj = obj[steps[i]]
  }
  return obj
}

function getClock(doc) {
  const backend  = Frontend.getBackend(doc);
  const state  = Frontend.getBackendState(doc);
  const clock = backend.getClock(state);
  return clock.toJS();
}

function change(doc, path, f) {
  let [doc2,_change] = Frontend.change(doc, (d) => {
    f(at(d,path))
  })
  return doc2
}

function changeMany(doc, path, count, f) {
  return change(doc, path, (d) => {
    for (let j = 0; j < count; j++) {
      f(d)
    }
  })
}

function setKey(d, key, value) {
  d[key] = value
}

function delKey(d, key) {
  if (key) {
    delete d[key]
  }
}

function getMaps(obj) {
  return walkObj(obj, "/", false, ["/"])
}

function getLists(obj) {
  return walkObj(obj, "/", true, [])
}
function walkObj(obj, path, isList, collection) {
  Object.keys(obj).forEach( (key) => {
    if (typeof obj[key] === 'object' && Array.isArray(obj[key]) === isList ) {
      let _path = path + key + "/";
      collection.push(_path)
      walkObj(obj[key], _path, isList, collection)
    }
  })
  return collection
}

function setSomeMapKeys(doc1, doc2) {
  let path = pick(getMaps(doc1))
  return [
    changeMany(doc1, path, 3, (d) => setKey(d,key(),value())),
    changeMany(doc2, path, 3, (d) => setKey(d,key(),value()))
  ]
}

function setAndDeleteSomeMapKeys(doc1, doc2) {
  let path = pick(getMaps(doc1))
  return [ doc1, doc2 ].map(doc => 
    changeMany(doc, path, 3, (d) => {
      bool() ?  setKey(d,key(),value()) : delKey(d,key(d))
    })
  )
}

function setSomeMapKeysInDifferentLocations(doc1, doc2) {
  let path1 = pick(getMaps(doc1))
  let path2 = pick(getMaps(doc2))
  return [
    changeMany(doc1, path1, 3, (d) => setKey(d,key(),value())),
    changeMany(doc2, path2, 3, (d) => setKey(d,key(),value())),
  ]
}

function makeAMap(doc1, doc2) {
  let path = pick(getMaps(doc1))
  let k = key()
  return [ 
    change(doc1, path, (doc) => doc[k] = {}),
    doc2
  ]
}

function makeAList(doc1, doc2) {
  let path = pick(getMaps(doc1))
  let k = key()
  return [ 
    change(doc1, path, (doc) => doc[k] = []),
    doc2
  ]
}

function selectScenario(doc1, doc2, m) {
  let scenarios = [
    setSomeMapKeys,
    setAndDeleteSomeMapKeys,
    setSomeMapKeysInDifferentLocations,
    makeAMap,
    makeAList
  ] 
  let [ docA, docB ] = shuffle(doc1,doc2)
  return pick(scenarios)(docA,docB, m)
}

function merge(localDoc, remoteDoc) {
  const localBackend  = Frontend.getBackend(localDoc);
  const remoteBackend  = Frontend.getBackend(remoteDoc);
  const localState  = Frontend.getBackendState(localDoc);
  const remoteState = Frontend.getBackendState(remoteDoc);
  const localClock = localBackend.getClock(localState);
  const remoteChanges = remoteBackend.getMissingChanges(remoteState,localClock);
  const [state, patch] = localBackend.applyChanges(localState, remoteChanges);
  if (patch.diffs.length === 0) return localDoc
  patch.state = state
  return Frontend.applyPatch(localDoc, patch)
}

describe('Automerge', function() {
  this.timeout(5000);
  describe('fuzz test ', () => {
    it('should initially be an empty map', () => {
      seed();
      //let doc1 = Frontend.init({backend: JsBackend, actorId: "wasm" })
      let doc1 = Frontend.init({backend: WasmBackend, actorId: "wasm" })
      let doc2 = Frontend.init({backend: JsBackend, actorId: "js" })
      for (let i = 0; i < 100; i++) {
        let [doc1a,doc2a] = selectScenario(doc1, doc2);
        doc1 = merge(doc1a,doc2a)
        doc2 = merge(doc2a,doc1a)
        assert.deepEqual(doc1, doc2)
      }
    })
  })
})
