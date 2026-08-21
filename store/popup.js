const DEFAULTS = {
  enabled: true,
  hidden: [],
  hiddenRegions: [],
  exemptHandles: [],
  protectFollowing: true
};

const $ = id => document.getElementById(id);
const { normalizeHandle, normalizeSettings } = XCF_DETECTION;
let settings = normalizeSettings(DEFAULTS);
let statusTimer = null;
let countryQuery = "";

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
  const exceptionCount = settings.exemptHandles.length;
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
  $("exception-count").textContent = String(exceptionCount);
  $("exception-count").hidden = exceptionCount === 0;
  $("protect-following").checked = settings.protectFollowing;
  $("following-rule").classList.toggle("on", settings.protectFollowing);
  $("clear").hidden = total === 0;
}

function renderGrid(gridId, entries, settingKey, markerClass, markerText, sortByName = false) {
  const grid = $(gridId);
  grid.innerHTML = "";

  const orderedEntries = Object.entries(entries);
  if (sortByName) {
    orderedEntries.sort(([, first], [, second]) => first.name.localeCompare(second.name));
  }

  orderedEntries.forEach(([code, item], index) => {
    const label = document.createElement("label");
    label.style.animationDelay = Math.min(index * 12, 180) + "ms";

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

function normalizeSearch(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function renderCountries() {
  const query = normalizeSearch(countryQuery.trim());
  const entries = Object.fromEntries(Object.entries(COUNTRY_DB).filter(([code, item]) => {
    if (!query) return true;
    return [code, item.name, ...(item.aliases || [])]
      .some(value => normalizeSearch(value).includes(query));
  }));

  renderGrid("countries", entries, "hidden", "flag", item => item.flag, true);
  $("country-empty").hidden = Object.keys(entries).length !== 0;
}

function renderAll() {
  renderGrid("regions", REGION_DB, "hiddenRegions", "region-mark", item => item.mark);
  renderCountries();
  renderExceptions();
}

function renderExceptions() {
  const list = $("exceptions");
  list.innerHTML = "";
  if (settings.exemptHandles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "exception-empty";
    empty.textContent = "No username exceptions yet.";
    list.appendChild(empty);
    return;
  }

  [...settings.exemptHandles].sort().forEach(handle => {
    const row = document.createElement("div");
    row.className = "exception-row";

    const name = document.createElement("span");
    name.textContent = "@" + handle;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "exception-remove";
    remove.setAttribute("aria-label", "Remove @" + handle);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      save({ exemptHandles: settings.exemptHandles.filter(item => item !== handle) });
      renderExceptions();
    });

    row.append(name, remove);
    list.appendChild(row);
  });
}

function showPanel(name) {
  document.querySelectorAll(".filter-tab").forEach(tab => {
    const active = tab.dataset.panel === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  for (const panel of ["regions", "countries", "exceptions"]) {
    $(panel + "-panel").hidden = name !== panel;
  }
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

$("protect-following").addEventListener("change", event => {
  save({ protectFollowing: event.target.checked });
});

$("exception-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("exception-input");
  const error = $("exception-error");
  const handle = normalizeHandle(input.value);

  if (!handle) {
    error.textContent = "Enter a valid X username.";
    error.hidden = false;
    return;
  }
  if (settings.exemptHandles.includes(handle)) {
    error.textContent = "@" + handle + " is already an exception.";
    error.hidden = false;
    return;
  }
  if (settings.exemptHandles.length >= 200) {
    error.textContent = "You can save up to 200 username exceptions.";
    error.hidden = false;
    return;
  }

  error.hidden = true;
  input.value = "";
  save({ exemptHandles: [...settings.exemptHandles, handle] });
  renderExceptions();
  input.focus();
});

$("exception-input").addEventListener("input", () => {
  $("exception-error").hidden = true;
});

$("country-search").addEventListener("input", event => {
  countryQuery = event.target.value;
  renderCountries();
});

$("clear").addEventListener("click", () => {
  save({ hidden: [], hiddenRegions: [] });
  renderAll();
});
