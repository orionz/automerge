/* tslint:disable */
/* eslint-disable */
export class State {
  free(): void;
/**
* @param {Array<any>} changes 
* @returns {Array<any>} 
*/
  applyChanges(changes: Array<any>): Array<any>;
/**
* @param {Array<any>} changes 
* @returns {any} 
*/
  loadChanges(changes: Array<any>): any;
/**
* @param {any} change 
* @returns {Array<any>} 
*/
  applyLocalChange(change: any): Array<any>;
/**
* @returns {any} 
*/
  getPatch(): any;
/**
* @returns {any} 
*/
  getHeads(): any;
/**
* @param {any} have_deps 
* @returns {Array<any>} 
*/
  getChanges(have_deps: any): Array<any>;
/**
* @param {any} actorid 
* @returns {Array<any>} 
*/
  getChangesForActor(actorid: any): Array<any>;
/**
* @returns {any} 
*/
  getMissingDeps(): any;
/**
* @returns {State} 
*/
  clone(): State;
/**
* @returns {any} 
*/
  save(): any;
/**
* @param {any} data 
* @returns {State} 
*/
  static load(data: any): State;
/**
* @returns {State} 
*/
  static new(): State;
}
