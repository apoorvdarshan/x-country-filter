const DEFAULTS = {
  enabled: true,
  mode: "filter",
  selected: ["US", "IN", "JP"],
  hideUnknown: false,
  customRules: ""
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
    cb.checked = settings.selected.includes(cc);
    cb.addEventListener("change", () => {
      const sel = new Set(settings.selected);
      cb.checked ? sel.add(cc) : sel.delete(cc);
      save({ selected: [...sel] });
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

function renderMode() {
  document.querySelectorAll("#mode button").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === settings.mode)
  );
  $("hideUnknownRow").style.visibility = settings.mode === "highlight" ? "hidden" : "visible";
}

chrome.storage.sync.get(DEFAULTS, s => {
  settings = s;
  $("enabled").checked = s.enabled;
  $("hideUnknown").checked = s.hideUnknown;
  $("customRules").value = s.customRules;
  renderCountries();
  renderMode();
});

$("enabled").addEventListener("change", e => save({ enabled: e.target.checked }));
$("hideUnknown").addEventListener("change", e => save({ hideUnknown: e.target.checked }));

document.querySelectorAll("#mode button").forEach(b =>
  b.addEventListener("click", () => {
    save({ mode: b.dataset.mode });
    renderMode();
  })
);

$("selAll").addEventListener("click", () => {
  save({ selected: Object.keys(COUNTRY_DB) });
  renderCountries();
});
$("selNone").addEventListener("click", () => {
  save({ selected: [] });
  renderCountries();
});

let rulesTimer = null;
$("customRules").addEventListener("input", e => {
  clearTimeout(rulesTimer);
  rulesTimer = setTimeout(() => save({ customRules: e.target.value }), 400);
});
