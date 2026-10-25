'use strict';

// Windows start preflight crosses multiple async network and filesystem calls.
// A Stop, import change, or window close must invalidate any pending start,
// even if the native process has not been spawned yet.
class EngineStartFence {
  constructor(){this.generation=0;this.pending=false;}
  begin(){
    if(this.pending)return null;
    this.pending=true;
    return ++this.generation;
  }
  current(token){
    return this.pending&&Number.isInteger(token)&&token===this.generation;
  }
  finish(token){
    if(token===this.generation)this.pending=false;
  }
  cancel(){
    this.generation++;
    this.pending=false;
  }
  get busy(){return this.pending;}
}
module.exports={EngineStartFence};
