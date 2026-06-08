export function extensionErrorCode(error) {
  if (error?.code) return error.code;
  const message = String(error?.message || error);
  if (message.includes('confirmSensitive=true')) return 'SENSITIVE_CONFIRMATION_REQUIRED';
  if (message.includes('confirmed=true')) return 'CONFIRMATION_REQUIRED';
  if (message.includes('outside the') || message.includes('strict workspace policy')) return 'TAB_SCOPE_VIOLATION';
  if (message.includes('No element matches selector')) return 'SELECTOR_NOT_FOUND';
  if (message.includes('requires selector')) return 'MISSING_SELECTOR';
  if (message.includes('requires url')) return 'MISSING_URL';
  if (message.includes('requires fields object')) return 'MISSING_FIELDS';
  return 'EXTENSION_COMMAND_FAILED';
}

export function extensionErrorDetails(error) {
  const details = {};
  if (error?.name) details.name = error.name;
  return Object.keys(details).length ? details : undefined;
}
