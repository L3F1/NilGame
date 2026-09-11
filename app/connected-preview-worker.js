import { createConnectedPreview } from './connected-preview-model.js';
let preview;
self.onmessage = async ({ data }) => {
  try {
    if (!preview) {
      const response = await fetch('../levels/fixtures/connected-sight.nil.json');
      if (!response.ok) throw new Error(`Scene load: HTTP ${response.status}`);
      preview = createConnectedPreview(await response.json());
    }
    if (data.action) preview.act(data.action);
    const frame = preview.render();
    self.postMessage(frame, [frame.pixels.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
