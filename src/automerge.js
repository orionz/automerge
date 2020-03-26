const transit = require('transit-immutable-js')
const { fromJS } = require('immutable')
const uuid = require('./uuid')
const Frontend = require('../frontend')
const defaultBackend = require('../backend')
const { isObject } = require('./common')

const _backendMgr = require('./backend')

_backendMgr.setDefaultBackend(defaultBackend)

function setDefaultBackend(b) {
  module.exports.Backend = b
  return _backendMgr.setDefaultBackend(b)
}

/**
 * Constructs a new frontend document that reflects the given list of changes.
 */
function docFromChanges(options, changes) {
  const doc = init(options)
  const backend = Frontend.getBackend(doc)
  const [state, _] = backend.applyChanges(backend.init(), changes)
  const patch = backend.getPatch(state)
  patch.state = state
  return Frontend.applyPatch(doc, patch)
}

///// Automerge.* API

function init(options) {
  if (typeof options === 'string') {
    options = {actorId: options}
  } else if (typeof options === 'undefined') {
    options = {}
  } else if (!isObject(options)) {
    throw new TypeError(`Unsupported options for init(): ${options}`)
  }
  return Frontend.init(Object.assign({backend: _backendMgr.getDefaultBackend()}, options))
}

/**
 * Returns a new document object initialized with the given state.
 */
function from(initialState, options) {
  const changeOpts = {message: 'Initialization', undoable: false}
  return change(init(options), changeOpts, doc => Object.assign(doc, initialState))
}

function change(doc, options, callback) {
  const [newDoc, change] = Frontend.change(doc, options, callback)
  return newDoc
}

function emptyChange(doc, options) {
  const [newDoc, change] = Frontend.emptyChange(doc, options)
  return newDoc
}

function undo(doc, options) {
  const [newDoc, change] = Frontend.undo(doc, options)
  return newDoc
}

function redo(doc, options) {
  const [newDoc, change] = Frontend.redo(doc, options)
  return newDoc
}

function load(string, options) {
  return docFromChanges(options, transit.fromJSON(string))
}

function save(doc) {
  const state = Frontend.getBackendState(doc)
  const backend = Frontend.getBackend(doc)
  return transit.toJSON(backend.getHistory(state))
}

function merge(localDoc, remoteDoc) {
  if (Frontend.getActorId(localDoc) === Frontend.getActorId(remoteDoc)) {
    throw new RangeError('Cannot merge an actor with itself')
  }
  const backend  = Frontend.getBackend(localDoc)
  const localState  = Frontend.getBackendState(localDoc)
  const remoteState = Frontend.getBackendState(remoteDoc)
  const [state, patch] = backend.merge(localState, remoteState)
  if (patch.diffs.length === 0) return localDoc
  patch.state = state
  return Frontend.applyPatch(localDoc, patch)
}

function diff(oldDoc, newDoc) {
  const backend  = Frontend.getBackend(oldDoc)
  const oldState = Frontend.getBackendState(oldDoc)
  const newState = Frontend.getBackendState(newDoc)
  const changes = backend.getChanges(oldState, newState)
  const [state, patch] = backend.applyChanges(oldState, changes)
  return patch.diffs
}

function getChanges(oldDoc, newDoc) {
  const backend  = Frontend.getBackend(oldDoc)
  const oldState = Frontend.getBackendState(oldDoc)
  const newState = Frontend.getBackendState(newDoc)
  return backend.getChanges(oldState, newState)
}

function getAllChanges(doc) {
  return getChanges(init(), doc)
}

function applyChanges(doc, changes) {
  const backend  = Frontend.getBackend(doc)
  const oldState = Frontend.getBackendState(doc)
  const [newState, patch] = backend.applyChanges(oldState, changes)
  patch.state = newState
  return Frontend.applyPatch(doc, patch)
}

function getMissingDeps(doc) {
  const backend  = Frontend.getBackend(doc)
  return backend.getMissingDeps(Frontend.getBackendState(doc))
}

function equals(val1, val2) {
  if (!isObject(val1) || !isObject(val2)) return val1 === val2
  const keys1 = Object.keys(val1).sort(), keys2 = Object.keys(val2).sort()
  if (keys1.length !== keys2.length) return false
  for (let i = 0; i < keys1.length; i++) {
    if (keys1[i] !== keys2[i]) return false
    if (!equals(val1[keys1[i]], val2[keys2[i]])) return false
  }
  return true
}

function getHistory(doc) {
  const state = Frontend.getBackendState(doc)
  const actor = Frontend.getActorId(doc)
  const backend = Frontend.getBackend(doc)
  const history = fromJS(backend.getHistory(state))
  return history.map((change, index) => {
    return {
      get change () {
        return change.toJS()
      },
      get snapshot () {
        return docFromChanges(actor, history.slice(0, index + 1))
      }
    }
  }).toArray()
}

module.exports = {
  init, from, change, emptyChange, undo, redo,
  load, save, merge, diff, getChanges, getAllChanges, applyChanges, getMissingDeps,
  equals, getHistory, uuid,
  Frontend, setDefaultBackend,
  DocSet: require('./doc_set'),
  WatchableDoc: require('./watchable_doc'),
  Connection: require('./connection')
}

module.exports.Backend = _backendMgr.getDefaultBackend()

for (let name of ['canUndo', 'canRedo', 'getObjectId', 'getObjectById', 'getActorId',
     'setActorId', 'getConflicts', 'Text', 'Table', 'Counter' ]) {
  module.exports[name] = Frontend[name]
}
