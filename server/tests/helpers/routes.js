// Test-only. Lists every route an Express app serves, with its mount prefix, by walking the router stack.
// Express writes a :param in a mount path as (?:/([^/]+?)) once the escaped slashes are normalised.
const PARAM = /\(\?:\/\(\[\^\/\]\+\?\)\)/g;

function mountPath(layer) {
  if (layer.regexp?.fast_slash) return '';
  let i = 0;
  const keys = layer.keys || [];
  return layer.regexp.source
    .replace(/\\\//g, '/')
    .replace('^', '')
    .replace('/?(?=/|$)', '')
    .replace(PARAM, () => `/:${keys[i++]?.name ?? 'param'}`);
}

function walk(stack, prefix, out) {
  for (const layer of stack) {
    if (layer.route) {
      const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` || '/';
      for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      walk(layer.handle.stack, `${prefix}${mountPath(layer)}`, out);
    }
  }
  return out;
}

export function listRoutes(app) {
  return walk(app._router.stack, '', []).sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}
