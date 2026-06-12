const UNSAFE_OBJECT_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

export function stripUnsafeObjectKeys(value, { allowedKeys = null } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = allowedKeys ? new Set(allowedKeys) : null;
  const output = Object.create(null);
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    if (allowed && !allowed.has(key)) continue;
    output[key] = entry;
  }
  return output;
}

export function hasUnsafeObjectKey(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => UNSAFE_OBJECT_KEYS.has(key));
}
