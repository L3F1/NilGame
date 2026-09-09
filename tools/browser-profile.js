// Cold runs never delete/reuse a possibly live Chrome profile. Warm runs only
// reuse a profile published after successful cleanup, with an exclusive lease.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

export function acquireBrowserProfile({ backend, warm = false, root = join(tmpdir(), 'nilgame-pagecheck') }) {
  if (!['gpu', 'sw'].includes(backend)) throw new Error('Unknown browser backend');
  root = resolve(root);
  mkdirSync(root, { recursive: true });
  const manifest = join(root, `${backend}-last.json`);
  let profile, reused = false;
  if (warm) {
    try {
      const candidate = JSON.parse(readFileSync(manifest, 'utf8')).profile;
      if (typeof candidate === 'string' && dirname(resolve(candidate)) === root
          && basename(candidate).startsWith(`${backend}-`)) {
        const fd = openSync(`${candidate}.lease`, 'wx'); closeSync(fd);
        profile = candidate; reused = true;
      }
    } catch { /* Missing cache or active lease: use a new cold profile. */ }
  }
  if (!profile) {
    profile = mkdtempSync(join(root, `${backend}-`));
    const fd = openSync(`${profile}.lease`, 'wx'); closeSync(fd);
  }
  let released = false;
  return {
    path: profile, reused,
    release(cacheable = false) {
      if (released) return;
      // Only a completely cleaned-up session may be advertised for warm use.
      if (cacheable) {
        const pending = `${profile}.json`;
        writeFileSync(pending, JSON.stringify({ profile }));
        renameSync(pending, manifest);
      } else {
        try {
          if (JSON.parse(readFileSync(manifest, 'utf8')).profile === profile) unlinkSync(manifest);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      unlinkSync(`${profile}.lease`);
      released = true;
    },
  };
}
