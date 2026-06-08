export function keyEventPayload(key, payload = {}) {
  const text = key.length === 1 ? key : undefined;
  const modifiers = [
    payload.altKey ? 1 : 0,
    payload.ctrlKey ? 2 : 0,
    payload.metaKey ? 4 : 0,
    payload.shiftKey ? 8 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const code = payload.code || keyCodeFor(key);
  return {
    key,
    code,
    text,
    unmodifiedText: text,
    modifiers,
    windowsVirtualKeyCode: virtualKeyCodeFor(key),
    nativeVirtualKeyCode: virtualKeyCodeFor(key),
  };
}

function keyCodeFor(key) {
  const named = {
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };
  if (named[key]) return named[key];
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
}

function virtualKeyCodeFor(key) {
  const named = {
    Enter: 13,
    Escape: 27,
    Tab: 9,
    Backspace: 8,
    Delete: 46,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
  };
  if (named[key]) return named[key];
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  return 0;
}
