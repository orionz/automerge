import assert from 'assert';
import * as fc from "fast-check"
import 'mocha';
import * as Automerge from 'automerge'
import equal from "fast-deep-equal"

/**
 * This is a property based test for Automerge. The basic idea of a property
 * based test is that rather than running specific cases of your system under
 * test and then making assertions about the results - as in a unit test - you
 * run the system under test with random inputs and then make assertions about
 * the properties of the results. E.g for a sorting algorithm you might 
 * generate random lists and assert that the result is sorted (you can use a
 * naive implementation in the assertion and a more efficient one in the 
 * implementation)
 *
 * In the case of automerge we have a property which is very amenable to this
 * approach: every replica which has received the same set of messages should
 * report the same document state. What we will do is set up a simulation of 
 * a set of documents talking to each other over a network, randomly mutate
 * each document, send messages between them, then assert that all the
 * documents are in the same state.
 *
 * The low level details of this follow. The reader will need to be familiar
 * with the fast-check property testing library for javascript (and TypeScript)
 * which is used in the implementation. The best way to understand it is
 * probably to look at the testcase at the end of this file and follow the code.
 */

/**
 * A scenario is a single run of the simulation. It contains the final state of
 * all the replicas.
 *
 * At the moment this just stores the map of replicas. As we start running in
 * to bugs it will probably make sense to start adding tracing information (e.g
 * what message was sent to what replica, what the result of various calls at 
 * each replica was etc.) to the scenario.
 */
class Scenario {
    replicas: Map<string, Replica>
    steps: Array<ScenarioStep>

    constructor(replicas: Map<string, Replica>, steps: Array<ScenarioStep>){
        this.replicas = replicas
        this.steps = steps
    }

    assertReplicasEqual(): void {
        const firstRepl: Replica = this.replicas.values().next().value
        const replicas = Array.from(this.replicas.values())
        const allEqual = (replicas.every(r => equal(r.docState(), firstRepl.docState())))
        if (!allEqual) {
            console.log("Not all replicas are equal")
            for (const replica of replicas) {
                console.log("State at replica: " + replica.id.toString())
                console.log(JSON.stringify(replica.docState(), null, 4))
            }
            assert.fail("Not all replicas equal")
        }
    }

}

/**
 * A scenario builder is used to generate a scenario. 
 */
class ScenarioBuilder {
    replicas: Map<string, Replica>
    steps: Array<ScenarioStep>

    constructor() {
        this.replicas = new Map();
        this.steps = []
        for (let i = 0; i < 5; i++) {
            const replica = new Replica(i.toString())
            this.replicas.set(i.toString(), replica)
        }
        for (const replica of this.replicas.values()){
            replica.connect()
        }
    }

    receive(replica: Replica): ScenarioStep {
        this._deliverMessages()
        const step: ReceiveAtReplica = {
            replicaId: replica.id,
            type: "receive_at_replica",
        }
        this.steps.push(step)
        return step
    }

    addMutation(replica: Replica, mutation: Mutation): ScenarioStep {
        replica.mutate(mutation)
        this._deliverMessages()
        const step: MutateReplica = {
            replicaId: replica.id,
            type: "mutate_replica",
            mutation: mutation,
        }
        this.steps.push(step)
        return step
    }

    build(): Scenario {
        this.deliverRemainingMessages()
        return new Scenario(this.replicas, this.steps)
    }

    deliverRemainingMessages() {
        for (const replica of this.replicas.values()) {
            replica.receiveRemainingMessages()
        }
    }

    /// Run after every mutate and sim step to make sure all messages in each
    /// replicas outbox have been broadcast
    _deliverMessages() {
        for (const replica of this.replicas.values()) {
            const otherReplicas = Array.from(this.replicas.values()).filter(r => r.id !== replica.id)
            while (replica.outbox.length > 0) {
                const message = replica.outbox.pop()
                for (const other of otherReplicas) {
                    other.inbox.push(message)
                }
            }
        }
    }

}


/**
 * A Replica is a single node. It has an inbox, an outbox, a connection and a
 * docset. The connection is wired up to use the inbox and outbox of the
 * replica.
 */
class Replica {
    id: string;
    docSet: Automerge.DocSet<any>;
    connection: Automerge.Connection<any>;
    inbox: Array<Automerge.Message>;
    outbox: Array<Automerge.Message>

    constructor(id: string) {
        this.id = id
        this.docSet = new Automerge.DocSet()
        this.docSet.setDoc("thedoc", Automerge.init({}))
        this.inbox = []
        this.outbox = []
        this.connection = new Automerge.Connection<any>(
            this.docSet, this.sendMsg
        )
    }

    /** Start the connection */
    connect() {
        this.connection.open()
    }

    /**
     * Pull the first message out of the inbox and pass it to the connection,
     * if there is one
     */
    receive() {
        if (this.inbox.length > 0) {
            this.connection.receiveMsg(this.inbox.pop())
        }
    }

    /** Called at the end of the simulation to process all the remaining 
     * messages in the inbox of this replica
     */
    receiveRemainingMessages() {
        while (this.inbox.length > 0){
            this.receive()
        }
    }

    /** Mutate the document managed by this replica */
    mutate(mutation: Mutation): void {
        const doc = this.docSet.getDoc("thedoc")
        const updatedDoc = applyMutation(doc, mutation)
        this.docSet.setDoc("thedoc", updatedDoc)
    }

    /** Wired up to the connection, adds the message to the outbox, the 
     * ScenarioBuilder takes care of passing this message to other replicas*/
    sendMsg = (message: Automerge.Message) => {
        this.outbox.push(message)
    }

    docState(): any {
        return this.docSet.getDoc("thedoc")
    }
}

type PathElement = string | number;
type Path = Array<PathElement>;


interface Mutation {
    path: Path;
    action: string;
    value: any;
}


interface MutateReplica {
    type: "mutate_replica";
    replicaId: string;
    mutation: Mutation;
}

interface ReceiveAtReplica {
    type: "receive_at_replica";
    replicaId: string;
}

/** This type keeps track of what steps have been applied, it will hopefully
 * come in useful when generating traces 
 */
type ScenarioStep = MutateReplica | ReceiveAtReplica 


/**
 * This is where we do the hard work of generating a random scenario. Because
 * each step in the simulation is dependent on the previous state of the 
 * simulation we use the `chain` combinator from fast-check, which is 
 * effectively monadic composition. After each step we recursively call 
 * ourselves, adding a step to the steps argument, until we reach 100 steps, at
 * which point we return the result of calling `ScenarioBuilder.build`. This is
 * the approach taken in this issue:
 * https://github.com/dubzzz/fast-check/issues/424
 */
const scenarioRawArb = (builder: ScenarioBuilder, steps: Array<ScenarioStep>): fc.Arbitrary<Scenario> => {
    // If we've generated 100 steps, stop and return the resulting scenario
    if (steps.length == 100) {
        return fc.constant(builder.build())
    }
    const stepTypes = ["receive", "mutate"]
    return fc.constantFrom(...stepTypes).chain(stepType => {
        let replicas = Array.from(builder.replicas).map(([_, r]) => r)
        let replicaArb = fc.constantFrom(...replicas)
        var nextStep: fc.Arbitrary<ScenarioStep> = null
        if (stepType === "receive") {
            nextStep = replicaArb.map(replica => builder.receive(replica))
        } else {
            nextStep = replicaArb.chain(replica => {
                return mutationArb(replica.docState()).map(m => builder.addMutation(replica, m))
            })
        }
        // Recursively call ourselves with one more step
        return nextStep.chain(s => scenarioRawArb(builder, [...steps, s]))
    })
}


/** This is a convenience arbitrary which just calls scenarioRawArb (which is 
 * a kind of monadic reducer) with the initial arguments
 */
const scenarioArb: fc.Arbitrary<Scenario> = fc.constant(new ScenarioBuilder()).chain(s => scenarioRawArb(s, []))

/**
 * This is the hard bit, generating an arbitrary mutation of an automerge
 * document. It's pretty inconvenient to work directly with functions of type
 * doc => void because functions are contravariant in their argument, so
 * instead we first generate an arbitrary path into the document, then choose
 * an action to perform on that path, then finally return a function which
 * applies the action to the path.
 *
 * I'm not sure how to generate arbitrary paths through the document which 
 * effectively cover the possible parameter space.
 */
//function mutationArb(doc: any): fc.Arbitrary<(doc: any) => void>{
function mutationArb(doc: any): fc.Arbitrary<Mutation>{
    return pathArb(doc).chain(path => {
        return fc.constantFrom("set", "delete").chain(action => {
            if (action === "delete") {
                return fc.constant({
                    action: "delete",
                    path: path,
                    value: null,
                })
            } else {
                return jsonObjectArb().map(obj => ({
                    action: "set",
                    path: path,
                    value: obj,
                }))
            }
        })
    })
}

function pathArb(doc: any): fc.Arbitrary<Path> {
    if (Array.isArray(doc)) {
        if (doc.length === 0) {
            return fc.constant([0])
        }
        let elemsWithIndex = doc.map((e, i) => [e,i])
        return fc.constantFrom(...elemsWithIndex).chain(([element, index]) => {
            if (isPrimitive(element)) {
                return  fc.constant([index])
            } else {
                return fc.float().chain(f => {
                    // 80% change of descending
                    if (f > 0.2) {
                        return pathArb(element).map(p => [index].concat(p))
                    } else {
                        return fc.constant([index])
                    }
                })
            }
        })
    } else if (typeof doc === "object" && doc !== null) {
        if (Object.keys(doc).length == 0) {
            return fc.constant([])
        }
        return fc.constantFrom(...Object.keys(doc)).chain((key: PathElement) => {
            const element = doc[key]
            if (isPrimitive(element)) {
                return  fc.constant([key])
            } else {
                return fc.float().chain(f => {
                    // 80% change of descending
                    if (f > 0.2) {
                        return pathArb(element).map(p => [key].concat(p))
                    } else {
                        return fc.constant([key])
                    }
                })
            }
        })
    } else {
        return fc.constant([])
    }
}

function isPrimitive(a: any): boolean {
    return Object(a) === a
}

function applyDelete(path: Path, doc: any): void {
    if (path.length === 0){
        return
    }
    let pathCopy = path.splice(0)
    let location = doc
    while (pathCopy.length > 1) {
        let nextField = pathCopy.pop()
        location = location[nextField]
    }
    let lastField = path[0]
    delete doc[lastField]
}

function applySet(path: Path, value: any, doc: any): void {
    if (path.length === 0){
        if (Array.isArray(value) || isPrimitive(value) || value === null) {
            // This is a hack, really we should modify mutationArb to not 
            // produce mutations which set an array or primitive as the root
            // object
            return 
        }
        for (const [key, v] of Object.entries(value)) {
            doc[key] = v
        }
        return
    }
    let pathCopy = path.splice(0)
    let location = doc
    while (pathCopy.length > 1) {
        let nextField = pathCopy.pop()
        location = location[nextField]
    }
    let lastField = path[0]
    doc[lastField] = value
}

function applyMutation(docWrapper: Automerge.Doc<any>, mutation: Mutation): Automerge.Doc<any> {
    return Automerge.change(docWrapper, doc => {
        if (mutation.action === "delete") {
            applyDelete(mutation.path, doc)
        } else {
            applySet(mutation.path, mutation.value, doc)
        }
    })
}

function jsonObjectArb(): fc.Arbitrary<any>{
    const key = fc.string(1)
    const values = [fc.boolean(), fc.integer(), fc.double(), fc.string(), fc.constant(null)]
    const maxDepth = 4
    return fc.anything({key, values, maxDepth})
}


describe("Automerge", () => {
    it.only("should converge", () => {
        // Given an arbitrary scenario, the replicas should all have the same
        // state
        fc.assert(fc.property(scenarioArb, scenario => {
            scenario.assertReplicasEqual()
        }), {numRuns: 1})
    })
})


