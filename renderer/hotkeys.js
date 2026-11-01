export const DEFAULT_HOTKEY = Object.freeze({
  key: 'v',
  alt: true,
  ctrl: false,
  shift: false,
  meta: false
});

const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Shift', 'Meta']);

export function isModifierKey(key) {
  return MODIFIER_KEYS.has(key);
}

export function hotkeyFromEvent(event) {
  if (!event.key || isModifierKey(event.key)) return null;
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return {
    key,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
}

export function matchesHotkey(event, hotkey) {
  const pressed = hotkeyFromEvent(event);
  return Boolean(pressed
    && pressed.key === hotkey.key
    && pressed.alt === hotkey.alt
    && pressed.ctrl === hotkey.ctrl
    && pressed.shift === hotkey.shift
    && pressed.meta === hotkey.meta);
}

export function formatHotkey(hotkey) {
  const modifiers = [];
  if (hotkey.ctrl) modifiers.push('Ctrl');
  if (hotkey.alt) modifiers.push('Alt');
  if (hotkey.shift) modifiers.push('Shift');
  if (hotkey.meta) modifiers.push('Win');
  const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
  return [...modifiers, key].join('+');
}

export function toElectronAccelerator(hotkey) {
  const modifiers = [];
  if (hotkey.ctrl) modifiers.push('Ctrl');
  if (hotkey.alt) modifiers.push('Alt');
  if (hotkey.shift) modifiers.push('Shift');
  if (hotkey.meta) modifiers.push('Super');
  const keyNames = { ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up' };
  const key = keyNames[hotkey.key] || (hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key);
  return [...modifiers, key].join('+');
}