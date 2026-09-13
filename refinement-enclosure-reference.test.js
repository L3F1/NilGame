import assert from 'node:assert/strict';
import {exactFloatUnits,exactMember,exactSphereBoxMiss} from './tools/refinement-enclosure-reference.js';
let checks=0;
const equal=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++;};
const rejects=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
const zero=[0,0,0,0],p=[1,0,0,0],u=[0,1,0,0],pole=[0,0,1,0];
equal(exactFloatUnits(0),0n,'positive zero');
equal(exactFloatUnits(-0),0n,'negative zero');
equal(exactFloatUnits(2**-149),1n,'smallest positive subnormal');
equal(exactFloatUnits(-(2**-149)),-1n,'smallest negative subnormal');
equal(exactFloatUnits(2**-126),1n<<23n,'smallest normal');
equal(exactFloatUnits(1),1n<<149n,'one');
equal(exactFloatUnits(-.75),-3n*(1n<<147n),'negative exact fraction');
const max=(2-2**-23)*2**127;
equal(exactFloatUnits(max),((1n<<24n)-1n)<<253n,'largest finite float');
equal(exactFloatUnits(-max),-(((1n<<24n)-1n)<<253n),'negative largest finite float');
for(const value of [NaN,Infinity,-Infinity,.1,Number.MIN_VALUE,1+2**-30,'1',null])
  rejects(()=>exactFloatUnits(value),'reject nonfinite, nonbinary32 or nonnumeric inputs');
equal(exactMember([1,-1,1,-1],zero,1),true,'all box faces are inclusive');
equal(exactMember([1+2**-23,0,0,0],zero,1),false,'one float beyond a face');
equal(exactMember([-0,0,-0,0],zero,-0),true,'signed-zero membership');
equal(exactMember(new Float32Array(p),p,0),true,'typed vectors');
equal(exactMember([2**-149,0,0,0],zero,0),false,'subnormal displacement is not zero');
equal(1-(-(2**-100)),1,'double subtraction hides this positive displacement');
equal(exactMember(p,[-(2**-100),0,0,0],1),false,'exact subtraction detects hidden outside-face displacement');
equal(exactMember(p,[2**-100,0,0,0],1),true,'tiny inward displacement is inside');
equal(exactMember([max,0,0,0],[-max,0,0,0],max),false,'extreme difference needs no float subtraction');
for(const fn of [()=>exactMember([0,0,0],zero,0),()=>exactMember(zero,[0,0,0,Infinity],1),
  ()=>exactMember(zero,zero,-1),()=>exactMember(zero,zero,Infinity),()=>exactMember(zero,zero,.1),
  ()=>exactMember({length:4},zero,0)])rejects(fn,'invalid membership input');
// The unit great circle (cos(t),sin(t),0,0) never reaches a positive pole cap.
equal(exactSphereBoxMiss(p,u,0,0,pole,.5),true,'global circle misses pole cap');
equal(exactSphereBoxMiss(p,u,0,0,p,.5),false,'circle enters equatorial cap');
equal(exactSphereBoxMiss(p,u,0,0,p,1),false,'tangent/equality is not a strict miss');
equal(exactSphereBoxMiss(p,u,.25,0,pole,.5),true,'expanded point box remains separated');
equal(exactSphereBoxMiss(p,u,.25,0,pole,.25),false,'reproving expanded box rejects its touching face');
equal(exactSphereBoxMiss(p,u,.5,0,pole,.25),false,'nominal miss cannot certify expanded box containing a hit');
equal(exactSphereBoxMiss(p,u,0,.5,pole,.25),false,'direction uncertainty also changes the certified amplitude');
equal(exactSphereBoxMiss(p,u,0,0,[.5,.5,0,0],.75),true,'A squared plus B squared: one half below nine sixteenths');
equal(exactSphereBoxMiss(p,u,0,0,[.5,.5,0,0],.5),false,'combined amplitude exceeds either separate coefficient');
equal(exactSphereBoxMiss([1,-1,0,0],zero,0,0,[.5,.5,0,0],.25),true,'signed dot cancels before taking its absolute value');
equal(exactSphereBoxMiss(zero,zero,.25,0,[-1,1,0,0],.5),false,'box support uses sum of absolute centre components');
equal(exactSphereBoxMiss(zero,zero,0,0,pole,2**-149),true,'positive subnormal constant retains strict separation');
equal(exactSphereBoxMiss([2**-149,0,0,0],zero,0,0,p,2**-149),false,'subnormal squared equality is preserved');
equal(exactSphereBoxMiss([max,0,0,0],zero,0,0,p,max),false,'extreme squared equality does not overflow');
equal(exactSphereBoxMiss(zero,zero,0,0,[max,0,0,0],max),true,'extreme finite centre remains valid');
for(const c of [0,-0,-1])equal(exactSphereBoxMiss(p,u,0,0,pole,c),false,'nonpositive constant cannot certify a miss');
for(const fn of [()=>exactSphereBoxMiss(p,u,-1,0,pole,.5),()=>exactSphereBoxMiss(p,u,0,-1,pole,.5),
  ()=>exactSphereBoxMiss(p,u,0,0,[0,0,0],.5),()=>exactSphereBoxMiss(p,u,0,0,pole,NaN),
  ()=>exactSphereBoxMiss(p,u,0,Infinity,pole,.5),()=>exactSphereBoxMiss(p,u,0,0,pole,.1)])
  rejects(fn,'invalid sphere-box input');
console.log(`refinement-enclosure-reference: ${checks} checks passed`);
