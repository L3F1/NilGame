// Load the actual opt-in page, without its check flag, to exercise startup and
// real controls. Separate document/model/history; no recursive acceptance run.
export async function checkEnclosureUI(shots){
  const frame=document.createElement('iframe'),started=performance.now();
  frame.title='Improved renderer acceptance';frame.width='900';frame.height='700';
  frame.src='/tools/connected-global-preview.html?preset=three&refinement=enclosure';
  document.body.prepend(frame);
  try{
    const deadline=performance.now()+90000;
    while(frame.contentDocument?.documentElement.dataset.rendererReady!=='enclosure'){
      const message=frame.contentDocument?.querySelector('#status')?.textContent||'';
      if(message.startsWith('Preview stopped:'))throw Error(message);
      if(performance.now()>deadline)throw Error('Improved editor startup timed out');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    const startupWallMs=performance.now()-started,doc=frame.contentDocument;
    const query=id=>doc.querySelector('#'+id);
    if(!query('improved-refinement').checked||!query('refine-spherical').checked)
      throw Error('Opt-in did not select improved refinement');
    if(!query('refine-help').textContent.includes('480 x 360'))throw Error('Improved memory guidance missing');
    query('smooth').checked=true;query('quality').value='640';
    query('quality').dispatchEvent(new frame.contentWindow.Event('change'));
    if(!query('refine-status').textContent.startsWith('Paused:'))throw Error('Oversized AA did not report fallback');
    query('quality').value='480';query('quality').dispatchEvent(new frame.contentWindow.Event('change'));
    if(!query('refine-status').textContent.startsWith('On with Smooth edges'))throw Error('Affordable AA did not recover');
    shots.push({name:'enclosure-editor-live',data:query('view').toDataURL()});
    query('refine-spherical').checked=false;
    query('refine-spherical').dispatchEvent(new frame.contentWindow.Event('change'));
    if(!query('refine-status').textContent.startsWith('Off.'))throw Error('Improved refinement cannot be disabled');
    return {label:'enclosure-ui',startupWallMs,optIn:true,resourceFallback:true,resizeRecovery:true,toggleOff:true,
      scope:'real page startup and controls; startup includes iframe fetch and first draw, not cold-cache proof'};
  }finally{
    frame.contentDocument?.querySelector('canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    frame.remove();
  }
}
