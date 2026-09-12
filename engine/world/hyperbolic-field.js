// Experimental additive metric balls, decoded from authored physical offsets.
// Exterior union distance is exact; interior magnitude is only conservative.
import {sampleHyperbolicBall,castHyperbolicBalls} from '../geometry/hyperbolic-balls.js';
export function compileHyperbolicField(entities,space){
  if(space.kind!=='h3')throw Error('Expected H3 field adapter');
  const balls=entities.map(entity=>{
    if(entity.kind!=='ball'||(entity.op!==undefined&&entity.op!=='add')||entity.target!==undefined)
      throw Error('H3 fields support additive balls only');
    const ball=Object.freeze({id:entity.id,center:Object.freeze(space.decode(entity.position)),radius:entity.radius});
    sampleHyperbolicBall(space,ball,ball.center); // Validate radius before queries.
    return ball;
  });
  function sample(p){
    space.validatePoint(p);
    let best={distance:Infinity,normal:null,owner:null,feature:'undefined'};
    for(const ball of balls){
      const s=sampleHyperbolicBall(space,ball,p);
      if(s.distance<best.distance)best={distance:s.distance,normal:s.normal,owner:ball.id,
        feature:s.normalUnique?'smooth':'undefined'};
      else if(s.distance===best.distance)best={...best,feature:'seam'};
    }
    return best;
  }
  return Object.freeze({sample,distance:p=>sample(p).distance,normal:p=>sample(p).normal,
    rayCast:(p,u,options)=>castHyperbolicBalls(space,balls,p,u,options),
    capabilities:Object.freeze({distance:'bound',exteriorDistance:'exact',
      interior:'sign-with-conservative-magnitude',normal:'piecewise-with-seams',intersection:'analytic-with-refusals'})});
}
