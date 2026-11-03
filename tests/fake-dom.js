// Minimal DOM for tests: elements with attributes, children, text, and
// compound selectors such as `section[role="region"]` or `a[href*="/status/"]`.

function matches(element, selector) {
  const parsed = selector.match(/^([a-z]+)?((?:\[[^\]]+\])*)$/i);
  if (!parsed) throw new Error("unsupported test selector: " + selector);
  if (parsed[1] && element.tagName.toLowerCase() !== parsed[1].toLowerCase()) return false;
  for (const [, name, operator, value] of
    parsed[2].matchAll(/\[([\w-]+)(?:([\^$*]?=)"([^"]*)")?\]/g)) {
    const actual = element.getAttribute(name);
    if (actual === null) return false;
    if (operator === "=" && actual !== value) return false;
    if (operator === "^=" && !actual.startsWith(value)) return false;
    if (operator === "$=" && !actual.endsWith(value)) return false;
    if (operator === "*=" && !actual.includes(value)) return false;
  }
  return true;
}

function descendants(element) {
  return element.children.flatMap(child => [child, ...descendants(child)]);
}

function el(tagName, attributes = {}, children = [], text = "") {
  const classes = new Set();
  const element = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    isConnected: true,
    children,
    parentElement: null,
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value)
    },
    get textContent() {
      return text + children.map(child => child.textContent).join("");
    },
    getAttribute: name => (name in attributes ? attributes[name] : null),
    matches: selector => matches(element, selector),
    closest(selector) {
      for (let node = element; node; node = node.parentElement) {
        if (matches(node, selector)) return node;
      }
      return null;
    },
    querySelectorAll: selector => descendants(element).filter(node => matches(node, selector)),
    querySelector: selector => element.querySelectorAll(selector)[0] || null
  };
  for (const child of children) child.parentElement = element;
  return element;
}

function documentFor(body, { lang = "en", cookie = "" } = {}) {
  return {
    body,
    cookie,
    documentElement: { lang },
    querySelectorAll: selector => body.querySelectorAll(selector),
    querySelector: selector => body.querySelector(selector)
  };
}

module.exports = { documentFor, el };
