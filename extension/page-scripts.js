export function collectText(options = {}) {
  const maxChars = Number(options.maxChars || 50_000);
  const text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    url: location.href,
    title: document.title,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    length: text.length,
  };
}

export function collectHTML(options = {}) {
  const maxChars = Number(options.maxChars || 100_000);
  const element = options.selector ? document.querySelector(options.selector) : document.documentElement;
  if (!element) throw new Error(`No element matches selector: ${options.selector}`);
  const html = options.outer === false ? element.innerHTML : element.outerHTML;
  return {
    url: location.href,
    title: document.title,
    selector: options.selector || 'html',
    html: html.slice(0, maxChars),
    truncated: html.length > maxChars,
    length: html.length,
  };
}

export async function waitForSelectorInPage(options = {}) {
  const selector = String(options.selector || '');
  const timeoutMs = Number(options.timeoutMs || 10_000);
  const visible = options.visible !== false;
  const started = Date.now();

  const isVisible = (element) => {
    if (!visible) return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.width > 0
      && rect.height > 0;
  };

  while (Date.now() - started < timeoutMs) {
    const element = document.querySelector(selector);
    if (element && isVisible(element)) {
      const rect = element.getBoundingClientRect();
      return {
        matched: true,
        selector,
        waitedMs: Date.now() - started,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for selector: ${selector}`);
}

export function elementClipForSelector(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No element matches selector: ${selector}`);
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) throw new Error(`Element has empty bounds: ${selector}`);
  return {
    x: Math.round(rect.left + window.scrollX),
    y: Math.round(rect.top + window.scrollY),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function clickAtInPage(options = {}) {
  const x = Number(options.x);
  const y = Number(options.y);
  const element = document.elementFromPoint(x, y);
  if (!element) throw new Error(`No element at coordinates ${x},${y}`);
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: options.button === 'right' ? 2 : 0,
  };
  element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
  element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
  element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
  element.dispatchEvent(new MouseEvent('click', eventOptions));
  return {
    clicked: { x, y, trusted: false },
    tag: element.tagName.toLowerCase(),
    text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    url: location.href,
    title: document.title,
  };
}

export function hoverInPage(options = {}) {
  let element = null;
  let x = Number(options.x);
  let y = Number(options.y);

  if (options.selector) {
    element = document.querySelector(options.selector);
    if (!element) throw new Error(`No element matches selector: ${options.selector}`);
    const rect = element.getBoundingClientRect();
    x = Number.isFinite(x) ? x : rect.left + rect.width / 2;
    y = Number.isFinite(y) ? y : rect.top + rect.height / 2;
  } else {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('hover requires selector or numeric x and y');
    element = document.elementFromPoint(x, y);
    if (!element) throw new Error(`No element at coordinates ${x},${y}`);
  }

  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  };
  element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
  element.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
  element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
  return {
    hovered: { x: Math.round(x), y: Math.round(y), trusted: false },
    tag: element.tagName.toLowerCase(),
    text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

export function pressKeyInPage(options = {}) {
  const eventOptions = {
    key: options.key,
    code: options.code || options.key,
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(options.ctrlKey),
    metaKey: Boolean(options.metaKey),
    altKey: Boolean(options.altKey),
    shiftKey: Boolean(options.shiftKey),
  };
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
  target.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  return {
    pressed: options.key,
    trusted: false,
    activeTag: target?.tagName?.toLowerCase?.() || null,
    url: location.href,
    title: document.title,
  };
}

export function selectOptionInPage(options = {}) {
  const select = document.querySelector(options.selector);
  if (!select) throw new Error(`No element matches selector: ${options.selector}`);
  if (select.tagName.toLowerCase() !== 'select') throw new Error(`Element is not a select: ${options.selector}`);

  let option = null;
  if (options.value !== undefined) {
    option = Array.from(select.options).find((candidate) => candidate.value === String(options.value));
  } else if (options.label !== undefined) {
    option = Array.from(select.options).find((candidate) => candidate.label === String(options.label) || candidate.text === String(options.label));
  } else if (Number.isInteger(options.index)) {
    option = select.options[options.index];
  }

  if (!option) throw new Error('No matching option found');
  select.value = option.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    selected: {
      selector: options.selector,
      value: option.value,
      label: option.label || option.text,
      index: option.index,
    },
    url: location.href,
    title: document.title,
  };
}

export function listSelectOptionsInPage(options = {}) {
  const select = document.querySelector(options.selector);
  if (!select) throw new Error(`No element matches selector: ${options.selector}`);
  if (select.tagName.toLowerCase() !== 'select') throw new Error(`Element is not a select: ${options.selector}`);
  return {
    selector: options.selector,
    options: Array.from(select.options).map((option) => ({
      value: option.value,
      label: option.label || option.text,
      text: option.text,
      index: option.index,
      disabled: option.disabled,
    })),
    url: location.href,
    title: document.title,
  };
}

function formFieldValueState(field, value = field.value) {
  const tag = field.tagName.toLowerCase();
  const type = (field.getAttribute('type') || '').toLowerCase();
  if (tag === 'select') return value !== undefined && value !== null && String(value) !== '' ? 'selected' : 'empty';
  if (type === 'checkbox' || type === 'radio') return Boolean(value) ? 'checked' : 'unchecked';
  if (type === 'password') return value ? 'present-sensitive' : 'empty';
  return value ? 'present' : 'empty';
}

export function fillFormInPage(options = {}) {
  const fields = options.fields || {};
  const dryRun = options.dryRun !== false;
  const results = [];
  for (const [selector, value] of Object.entries(fields)) {
    const element = document.querySelector(selector);
    if (!element) {
      results.push({ selector, ok: false, error: `No element matches selector: ${selector}` });
      continue;
    }
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    const nextValue = value;
    const result = {
      selector,
      ok: true,
      tag,
      type,
      beforeState: formFieldValueState(element, type === 'checkbox' || type === 'radio' ? element.checked : element.value),
      plannedValueState: formFieldValueState(element, nextValue),
      dryRun,
    };
    if (!dryRun) {
      if (tag === 'select') {
        element.value = String(nextValue);
      } else if (type === 'checkbox' || type === 'radio') {
        element.checked = Boolean(nextValue);
      } else {
        element.focus();
        element.value = String(nextValue);
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      result.afterState = formFieldValueState(element, type === 'checkbox' || type === 'radio' ? element.checked : element.value);
    }
    results.push(result);
  }
  return {
    dryRun,
    fields: results,
    applied: !dryRun,
    url: location.href,
    title: document.title,
  };
}

export function collectStorageSnapshot(options = {}) {
  const maxValueChars = Number(options.maxValueChars || 500);
  const serialize = (storage) => Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter(Boolean)
    .map((key) => {
      const value = storage.getItem(key);
      return {
        key,
        value: options.includeValues ? String(value).slice(0, maxValueChars) : undefined,
        truncated: options.includeValues ? String(value).length > maxValueChars : undefined,
      };
    });

  return {
    url: location.href,
    title: document.title,
    localStorage: serialize(window.localStorage),
    sessionStorage: serialize(window.sessionStorage),
  };
}

export function collectObserve(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 80), 1), 300);
  const maxTextChars = Math.min(Math.max(Number(options.maxTextChars || 160), 20), 1000);
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.width > 0
      && rect.height > 0;
  };
  const selectorFor = (element) => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const name = element.getAttribute('name');
    if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    const aria = element.getAttribute('aria-label');
    if (aria) return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
    const href = element.getAttribute('href');
    if (href && element.tagName.toLowerCase() === 'a') return `a[href="${CSS.escape(href)}"]`;
    return element.tagName.toLowerCase();
  };
  const accessibleLabel = (element) => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const label = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '')
        .map(clean)
        .filter(Boolean)
        .join(' ');
      if (label) return label;
    }
    if (element.getAttribute('aria-label')) return clean(element.getAttribute('aria-label'));
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return clean(label.innerText || label.textContent);
    }
    return clean(element.innerText || element.textContent || element.getAttribute('placeholder') || element.getAttribute('title'));
  };
  const inferredRole = (element) => {
    const explicit = element.getAttribute('role');
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    return tag;
  };
  const actionKind = (element, role) => {
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (tag === 'a') return 'navigate';
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'type';
    if (tag === 'input' && !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(type)) return 'type';
    if (tag === 'input' && ['checkbox', 'radio'].includes(type)) return 'toggle';
    if (tag === 'button' || role === 'button' || ['button', 'submit', 'reset'].includes(type)) return 'click';
    return 'interact';
  };
  const riskHint = (element, action, label) => {
    const type = (element.getAttribute('type') || '').toLowerCase();
    const text = `${label} ${element.getAttribute('value') || ''}`.toLowerCase();
    if (type === 'submit' || /\b(send|submit|save|delete|remove|publish|buy|pay|confirm)\b/.test(text)) return 'likely_mutation';
    if (action === 'navigate') return 'safe_nav';
    if (['type', 'select', 'toggle'].includes(action)) return 'form_input';
    return 'unknown_interaction';
  };
  const scoreFor = (element, role, label, action) => {
    let score = 0;
    if (element.id) score += 20;
    if (element.getAttribute('data-testid') || element.getAttribute('data-test')) score += 20;
    if (label) score += 15;
    if (['button', 'link', 'textbox', 'combobox'].includes(role)) score += 10;
    if (action === 'navigate') score += 4;
    if (element.disabled || element.getAttribute('aria-disabled') === 'true') score -= 40;
    return score;
  };
  const nearbyTextFor = (element) => {
    const containers = [
      element.closest('label'),
      element.closest('fieldset'),
      element.closest('form'),
      element.closest('section'),
      element.closest('article'),
      element.closest('main'),
      element.parentElement,
    ].filter(Boolean);
    const container = containers.find((candidate) => clean(candidate.innerText || candidate.textContent)) || document.body;
    return clean(container?.innerText || container?.textContent).slice(0, Math.max(maxTextChars * 4, 400));
  };

  const candidates = Array.from(document.querySelectorAll([
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[tabindex]',
  ].join(',')))
    .filter(isVisible)
    .map((element, index) => {
      const rect = element.getBoundingClientRect();
      const role = inferredRole(element);
      const label = accessibleLabel(element);
      const action = actionKind(element, role);
      return {
        index,
        selector: selectorFor(element),
        tag: element.tagName.toLowerCase(),
        role,
        action,
        risk: riskHint(element, action, label),
        label: label.slice(0, maxTextChars),
        text: clean(element.innerText || element.textContent).slice(0, maxTextChars),
        nearbyText: nearbyTextFor(element),
        placeholder: element.getAttribute('placeholder'),
        name: element.getAttribute('name'),
        type: element.getAttribute('type'),
        href: element.getAttribute('href'),
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        score: scoreFor(element, role, label, action),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    })
    .filter((item) => {
      const textNeedle = clean(options.text).toLowerCase();
      const nearTextNeedle = clean(options.nearText).toLowerCase();
      const roleNeedle = clean(options.role).toLowerCase();
      const placeholderNeedle = clean(options.placeholder).toLowerCase();
      const hrefNeedle = clean(options.href).toLowerCase();
      const actionNeedle = clean(options.actionKind).toLowerCase();
      const riskNeedle = clean(options.risk).toLowerCase();
      if (textNeedle && !`${item.label} ${item.text} ${item.name || ''}`.toLowerCase().includes(textNeedle)) return false;
      if (nearTextNeedle && !`${item.nearbyText} ${item.label} ${item.text}`.toLowerCase().includes(nearTextNeedle)) return false;
      if (roleNeedle && String(item.role || '').toLowerCase() !== roleNeedle) return false;
      if (placeholderNeedle && !String(item.placeholder || '').toLowerCase().includes(placeholderNeedle)) return false;
      if (hrefNeedle && !String(item.href || '').toLowerCase().includes(hrefNeedle)) return false;
      if (actionNeedle && String(item.action || '').toLowerCase() !== actionNeedle) return false;
      if (riskNeedle && String(item.risk || '').toLowerCase() !== riskNeedle) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);

  return {
    url: location.href,
    title: document.title,
    mode: 'read-only',
    elementCount: candidates.length,
    elements: candidates,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
  };
}

export function collectExtract(options = {}) {
  const kind = String(options.kind || 'all');
  const maxItems = Math.min(Math.max(Number(options.maxItems || 50), 1), 500);
  const maxTextChars = Math.min(Math.max(Number(options.maxTextChars || 300), 50), 2_000);
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const clip = (value) => clean(value).slice(0, maxTextChars);
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.width > 0
      && rect.height > 0;
  };
  const selectorFor = (element) => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const name = element.getAttribute('name');
    if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    return element.tagName.toLowerCase();
  };
  const shouldInclude = (target) => kind === 'all' || kind === target;

  const tables = shouldInclude('tables')
    ? Array.from(document.querySelectorAll('table'))
      .filter(isVisible)
      .slice(0, Math.min(maxItems, 25))
      .map((table, index) => {
        const rows = Array.from(table.querySelectorAll('tr'))
          .slice(0, 100)
          .map((row) => Array.from(row.querySelectorAll('th,td'))
            .slice(0, 30)
            .map((cell) => clip(cell.innerText || cell.textContent)));
        return {
          index,
          selector: selectorFor(table),
          rows,
        };
      })
    : [];

  const forms = shouldInclude('forms')
    ? Array.from(document.querySelectorAll('form, fieldset, [role="form"]'))
      .filter(isVisible)
      .slice(0, Math.min(maxItems, 50))
      .map((form, index) => ({
        index,
        selector: selectorFor(form),
        fields: Array.from(form.querySelectorAll('input,textarea,select'))
          .filter(isVisible)
          .slice(0, 100)
          .map((field) => ({
            selector: selectorFor(field),
            tag: field.tagName.toLowerCase(),
            name: field.getAttribute('name'),
            type: field.getAttribute('type'),
            label: clip(field.getAttribute('aria-label') || field.getAttribute('placeholder') || field.labels?.[0]?.innerText || ''),
            valueState: formFieldValueState(field),
            required: Boolean(field.required || field.getAttribute('aria-required') === 'true'),
            disabled: Boolean(field.disabled || field.getAttribute('aria-disabled') === 'true'),
          })),
      }))
    : [];

  const lists = shouldInclude('lists')
    ? Array.from(document.querySelectorAll('ul,ol,[role="list"]'))
      .filter(isVisible)
      .slice(0, Math.min(maxItems, 50))
      .map((list, index) => ({
        index,
        selector: selectorFor(list),
        items: Array.from(list.querySelectorAll('li,[role="listitem"]'))
          .filter(isVisible)
          .slice(0, 100)
          .map((item) => clip(item.innerText || item.textContent)),
      }))
    : [];

  const keyValues = shouldInclude('keyValues')
    ? Array.from(document.querySelectorAll('dl, table, section, article, main'))
      .filter(isVisible)
      .slice(0, Math.min(maxItems, 50))
      .flatMap((container) => {
        const pairs = [];
        const terms = Array.from(container.querySelectorAll('dt'));
        for (const term of terms) {
          const value = term.nextElementSibling?.tagName?.toLowerCase() === 'dd' ? term.nextElementSibling : null;
          if (value) pairs.push({ key: clip(term.innerText || term.textContent), value: clip(value.innerText || value.textContent) });
        }
        const rows = Array.from(container.querySelectorAll('tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('th,td'));
          if (cells.length === 2) {
            pairs.push({ key: clip(cells[0].innerText || cells[0].textContent), value: clip(cells[1].innerText || cells[1].textContent) });
          }
        }
        return pairs;
      })
      .filter((pair) => pair.key && pair.value)
      .slice(0, maxItems)
    : [];

  return {
    url: location.href,
    title: document.title,
    kind,
    tables,
    forms,
    lists,
    keyValues,
  };
}

export function collectSnapshot(options = {}) {
  const maxChars = Number(options.maxChars || 50_000);
  const text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.width > 0
      && rect.height > 0;
  };
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const selectorFor = (element) => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const aria = element.getAttribute('aria-label');
    if (aria) return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
    const href = element.getAttribute('href');
    if (href && element.tagName.toLowerCase() === 'a') {
      return `a[href="${CSS.escape(href)}"]`;
    }
    return element.tagName.toLowerCase();
  };
  const elementInfo = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      selector: selectorFor(element),
      text: clean(element.innerText || element.textContent).slice(0, 300),
      ariaLabel: element.getAttribute('aria-label'),
      role: element.getAttribute('role'),
      href: element.getAttribute('href'),
      type: element.getAttribute('type'),
      name: element.getAttribute('name'),
      placeholder: element.getAttribute('placeholder'),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };

  const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .filter(isVisible)
    .slice(0, 80)
    .map((element) => ({
      level: element.tagName.toLowerCase(),
      text: clean(element.innerText || element.textContent),
    }));

  const elements = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[tabindex]'))
    .filter(isVisible)
    .slice(0, 250)
    .map(elementInfo);

  const tables = Array.from(document.querySelectorAll('table'))
    .filter(isVisible)
    .slice(0, 10)
    .map((table) => Array.from(table.querySelectorAll('tr'))
      .slice(0, 25)
      .map((row) => Array.from(row.querySelectorAll('th,td'))
        .slice(0, 12)
        .map((cell) => clean(cell.innerText || cell.textContent).slice(0, 200))));

  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .slice(0, 20)
    .map((script) => script.textContent?.slice(0, 5000) || '');

  return {
    url: location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio,
    },
    headings,
    elements,
    tables,
    jsonLd,
    text: text.slice(0, maxChars),
    textLength: text.length,
    truncated: text.length > maxChars,
  };
}
