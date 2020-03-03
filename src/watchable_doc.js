const { Set } = require('immutable')
const Frontend = require('../frontend')

class WatchableDoc {
  constructor (doc) {
    if (!doc) throw new Error("doc argument is required")
    this.doc = doc
    this.handlers = Set()
  }

  get () {
    return this.doc
  }

  set (doc) {
    this.doc = doc
    this.handlers.forEach(handler => handler(doc))
  }

  applyChanges (changes) {
    const oldState = Frontend.getBackendState(this.doc)
    const backend = Frontend.getBackend(this.doc)
    const [newState, patch] = backend.applyChanges(oldState, changes)
    patch.state = newState
    const newDoc = Frontend.applyPatch(this.doc, patch)
    this.set(newDoc)
    return newDoc
  }

  registerHandler (handler) {
    this.handlers = this.handlers.add(handler)
  }

  unregisterHandler (handler) {
    this.handlers = this.handlers.remove(handler)
  }
}

module.exports = WatchableDoc
