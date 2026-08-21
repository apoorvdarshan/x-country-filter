const DEFAULTS = {
  enabled: true,
  hidden: [],
  hiddenRegions: []
};

const $ = id => document.getElementById(id);
const { normalizeSettings } = XCF_DETECTION;
let settings = normalizeSettings(DEFAULTS);
let statusTimer = null;

function save(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  const normalizedPatch = Object.fromEntries(
    Object.keys(patch).map(key => [key, settings[key]])
  );
  chrome.storage.sync.set(normalizedPatch, () => {
    $("status").classList.add("show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => $("status").classList.remove("show"), 1200);
  });
  refresh();
}

function countLabel(count, singular, plural) {
  return count ? count + " " + (count === 1 ? singular : plural) : "";
}

function refresh() {
  const countryCount = settings.hidden.length;
  const regionCount = settings.hiddenRegions.length;
  const total = countryCount + regionCount;
  const summary = $("summary");

  if (!settings.enabled) {
    summary.textContent = "Filter is off — nothing is suppressed";
    summary.classList.remove("active");
  } else if (total === 0) {
    summary.textContent = "Choose regions or countries to suppress";
    summary.classList.remove("active");
  } else {
    summary.textContent = "Suppressing " + [
      countLabel(regionCount, "region", "regions"),
      countLabel(countryCount, "country", "countries")
    ].filter(Boolean).join(" · ");
    summary.classList.add("active");
  }

  for (const id of ["regions", "countries"]) {
    $(id).classList.toggle("off", !settings.enabled);
  }
  for (const [id, count] of [["region-count", regionCount], ["country-count", countryCount]]) {
    $(id).textContent = String(count);
    $(id).hidden = count === 0;
  }
  $("clear").hidden = total === 0;
}

function renderGrid(gridId, entries, settingKey, markerClass, markerText) {
  const grid = $(gridId);
  grid.innerHTML = "";

  Object.entries(entries).forEach(([code, item], index) => {
    const label = document.createElement("label");
    label.style.animationDelay = (index * 14) + "ms";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = settings[settingKey].includes(code);
    label.classList.toggle("on", checkbox.checked);
    checkbox.addEventListener("change", () => {
      const selected = new Set(settings[settingKey]);
      checkbox.checked ? selected.add(code) : selected.delete(code);
      label.classList.toggle("on", checkbox.checked);
      save({ [settingKey]: [...selected] });
    });

    const box = document.createElement("span");
    box.className = "box";

    const marker = document.createElement("span");
    marker.className = markerClass;
    marker.textContent = markerText(item);

    const name = document.createElement("span");
    name.className = "cname";
    name.textContent = item.name;
    name.title = item.name;

    label.append(checkbox, box, marker, name);
    grid.appendChild(label);
  });
}

function renderAll() {
  renderGrid("regions", REGION_DB, "hiddenRegions", "region-mark", item => item.mark);
  renderGrid("countries", COUNTRY_DB, "hidden", "flag", item => item.flag);
}

function showPanel(name) {
  document.querySelectorAll(".filter-tab").forEach(tab => {
    const active = tab.dataset.panel === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $("regions-panel").hidden = name !== "regions";
  $("countries-panel").hidden = name !== "countries";
}

const tabs = [...document.querySelectorAll(".filter-tab")];
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showPanel(tab.dataset.panel));
  tab.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    next.focus();
    showPanel(next.dataset.panel);
  });
});

chrome.storage.sync.get(DEFAULTS, value => {
  settings = normalizeSettings(value);
  $("enabled").checked = settings.enabled;
  renderAll();
  refresh();
});

$("enabled").addEventListener("change", event => save({ enabled: event.target.checked }));

$("clear").addEventListener("click", () => {
  save({ hidden: [], hiddenRegions: [] });
  renderAll();
});
