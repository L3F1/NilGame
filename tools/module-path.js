// Repository-relative module IDs for the dev-only preview bundler.
import { posix } from 'node:path';

export function modulePath(importer, specifier) {
  if (!/^\.\.?\//.test(specifier)) throw new Error(`Not a relative import: ${specifier}`);
  const id = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (id.startsWith('../') || posix.isAbsolute(id)) throw new Error(`Import outside project: ${specifier}`);
  return id;
}
