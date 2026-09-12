// Adapt legacy hit/null crossings and explicit bounded query results.
// Only a producer-owned uncertaintyFrom can certify a prefix; diagnostic
// distance must never supply it. Invalid packets conservatively refuse at zero.
export function apertureResult(value, range) {
  const invalid=()=>({status:'unresolved',reason:'invalid-aperture-result',uncertaintyFrom:0});
  if(value==null)return {status:'miss'};
  if(value.status==='unresolved') {
    const bound=value.uncertaintyFrom??0;
    if(!Number.isFinite(bound)||bound<0||bound>range)return invalid();
    return {status:'unresolved',reason:value.reason??'aperture-query',uncertaintyFrom:bound};
  }
  if(value.status==='miss')return Number.isFinite(value.checkedDistance)&&value.checkedDistance>=range
    ?{status:'miss'}:invalid();
  if(value.status!==undefined&&value.status!=='hit')return invalid();
  if(!Number.isFinite(value.distance)||value.distance<0||value.distance>range)return invalid();
  return {...value,status:'hit'};
}
