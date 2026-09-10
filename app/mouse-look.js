// Same input policy as the arena: discard pointer-lock spikes, settle on
// acquisition, accumulate high-rate events, and apply one bounded turn/frame.
// No camera or geometry policy here; the host chooses upright vs free flight.
export function createMouseLook({sensitivity=.0025}={}) {
  let x=0,y=0,readyAt=Infinity,active=false;
  const clear=()=>{x=0;y=0;};
  return {
    reset(locked,now){clear();active=locked;readyAt=now+250;},
    push(dx,dy,now){
      if(!active||now<readyAt||!Number.isFinite(dx)||!Number.isFinite(dy)
        ||Math.abs(dx)>250||Math.abs(dy)>250)return;
      x+=dx;y+=dy;
    },
    drain(){
      const cap=v=>Math.max(-.6,Math.min(.6,v));
      const result={yaw:-cap(x*sensitivity)||0,pitch:-cap(y*sensitivity)||0};
      clear();return result;
    },
  };
}
