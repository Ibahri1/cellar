export const INACTIVITY_MS=30_000;
type Clock={now:()=>number;set:(callback:()=>void,delay:number)=>unknown;clear:(handle:unknown)=>void};
/** Activity updates a deadline without creating a timer on every pointer move. */
export class IdleTimer{
 private timer:unknown;private last=0;private paused=false;private disposed=false;private fired=false;
 private idle:()=>void;private clock:Clock;private delay:number;
 constructor(idle:()=>void,clock:Clock,delay=INACTIVITY_MS){this.idle=idle;this.clock=clock;this.delay=delay;}
 activity(){if(this.disposed||this.fired)return;this.last=this.clock.now();if(!this.paused&&this.timer===undefined)this.arm(this.delay);}
 setPaused(value:boolean){if(this.disposed||value===this.paused)return;this.paused=value;this.cancel();this.last=this.clock.now();this.fired=false;if(!value)this.arm(this.delay);}
 stop(){this.disposed=true;this.cancel();}
 private cancel(){if(this.timer!==undefined)this.clock.clear(this.timer);this.timer=undefined;}
 private arm(delay:number){this.timer=this.clock.set(()=>{this.timer=undefined;if(this.disposed||this.paused||this.fired)return;const remaining=this.delay-(this.clock.now()-this.last);if(remaining>0)this.arm(remaining);else{this.fired=true;this.idle();}},delay);}
}
