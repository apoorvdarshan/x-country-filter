const DEFAULTS = {
  enabled: true,
  hidden: []
};

const $ = id => document.getElementById(id);
let settings = { ...DEFAULTS };
let statusTimer = null;

function save(patch) {
  Object.assign(settings, patch);
  chrome.storage.sync.set(patch, () => {
    $("status").classList.add("show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => $("status").classList.remove("show"), 1200);
  });
  refresh();
}

function refresh() {
  const n = settings.hidden.length;
  const summary = $("summary");
  if (!settings.enabled) {
    summary.textContent = "Filter is off — nothing is hidden";
    summary.classList.remove("active");
  } else if (n === 0) {
    summary.textContent = "Check a country to hide its posts";
    summary.classList.remove("active");
  } else {
    summary.textContent = `Hiding posts from ${n} ${n === 1 ? "country" : "countries"}`;
    summary.classList.add("active");
  }
  $("countries").classList.toggle("off", !settings.enabled);
  $("clear").hidden = n === 0;
}

function renderCountries() {
  const grid = $("countries");
  grid.innerHTML = "";
  Object.entries(COUNTRY_DB).forEach(([cc, c], i) => {
    const label = document.createElement("label");
    label.style.animationDelay = `${i * 14}ms`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = settings.hidden.includes(cc);
    label.classList.toggle("on", cb.checked);
    cb.addEventListener("change", () => {
      const set = new Set(settings.hidden);
      cb.checked ? set.add(cc) : set.delete(cc);
      label.classList.toggle("on", cb.checked);
      save({ hidden: [...set] });
    });
    const box = document.createElement("span");
    box.className = "box";
    const flag = document.createElement("span");
    flag.className = "flag";
    flag.textContent = c.flag;
    const name = document.createElement("span");
    name.className = "cname";
    name.textContent = c.name;
    name.title = c.name;
    label.append(cb, box, flag, name);
    grid.appendChild(label);
  });
}

chrome.storage.sync.get(DEFAULTS, s => {
  settings = s;
  $("enabled").checked = s.enabled;
  renderCountries();
  refresh();
});

$("enabled").addEventListener("change", e => save({ enabled: e.target.checked }));

$("clear").addEventListener("click", () => {
  save({ hidden: [] });
  renderCountries();
});
