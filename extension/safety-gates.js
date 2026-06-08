export function requireConfirmed(payload, action) {
  if (!payload.confirmed) throw new Error(`${action} requires confirmed=true`);
}

export function requireSensitiveConfirmed(payload, action) {
  if (!payload.confirmSensitive) {
    throw new Error(`${action} requires confirmSensitive=true because it can expose private browser data`);
  }
}
