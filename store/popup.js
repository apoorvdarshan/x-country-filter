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
    $("status").textContent = "Saved ✓";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { $("status").innerHTML = "&nbsp;"; }, 1200);
  });
}

function renderCountries() {
  const grid = $("countries");
  grid.innerHTML = "";
  for (const [cc, c] of Object.entries(COUNTRY_DB)) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = settings.hidden.includes(cc);
    cb.addEventListener("change", () => {
      const set = new Set(settings.hidden);
      cb.checked ? set.add(cc) : set.delete(cc);
      save({ hidden: [...set] });
    });
    const flag = document.createElement("span");
    flag.className = "flag";
    flag.textContent = c.flag;
    const name = document.createElement("span");
    name.className = "cname";
    name.textContent = c.name;
    label.append(cb, flag, name);
    grid.appendChild(label);
  }
}

chrome.storage.sync.get(DEFAULTS, s => {
  settings = s;
  $("enabled").checked = s.enabled;
  renderCountries();
});

$("enabled").addEventListener("change", e => save({ enabled: e.target.checked }));
