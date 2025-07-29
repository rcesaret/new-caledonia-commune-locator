/*
 * Advanced application script for the New Caledonia Commune Locator.
 *
 * This script builds upon the original leaflet map by adding a number of
 * interactive features: split coordinate inputs with decimal⇄DMS toggle,
 * on‑demand loading of commune boundaries, Wikipedia popups, a collapsible
 * information panel, dark‑mode tile switching, keyboard shortcuts, live
 * validation and permalink sharing.  It is designed to run entirely on
 * the client and does not require any server‑side components beyond
 * serving the static GeoJSON file.  If the local file fails to load
 * (for example when running from a different origin) the loader will
 * gracefully fall back to the remote dataset hosted on GitHub.
 */

// Global state
let map;
let communeLayer;
let highlightLayer;
let darkMode = false;

// A lookup table mapping normalised commune names (lowercase with
// apostrophes removed) to their corresponding Wikipedia pages.  When
// clicking a commune polygon the map will show its name and a link to
// the appropriate article.  The keys are derived by
// `name.replace(/['’]/g, '').toLowerCase()`.
const wiki = {
  'thio': 'https://en.wikipedia.org/wiki/Thio,_New_Caledonia',
  'yaté': 'https://en.wikipedia.org/wiki/Yaté,_New_Caledonia',
  'lîle-des-pins': "https://en.wikipedia.org/wiki/L%27Île-des-Pins",
  'le mont-dore': 'https://en.wikipedia.org/wiki/Le_Mont-Dore,_New_Caledonia',
  'nouméa': 'https://en.wikipedia.org/wiki/Nouméa',
  'dumbéa': 'https://en.wikipedia.org/wiki/Dumbéa',
  'païta': 'https://en.wikipedia.org/wiki/Païta',
  'boulouparis': 'https://en.wikipedia.org/wiki/Boulouparis',
  'la foa': 'https://en.wikipedia.org/wiki/La_Foa',
  'sarraméa': 'https://en.wikipedia.org/wiki/Sarraméa',
  'farino': 'https://en.wikipedia.org/wiki/Farino',
  'moindou': 'https://en.wikipedia.org/wiki/Moindou',
  'bourail': 'https://en.wikipedia.org/wiki/Bourail',
  'poya': 'https://en.wikipedia.org/wiki/Poya,_New_Caledonia',
  'pouembout': 'https://en.wikipedia.org/wiki/Pouembout',
  'koné': 'https://en.wikipedia.org/wiki/Koné,_New_Caledonia',
  'voh': 'https://en.wikipedia.org/wiki/Voh',
  'kaala-gomen': 'https://en.wikipedia.org/wiki/Kaala-Gomen',
  'koumac': 'https://en.wikipedia.org/wiki/Koumac',
  'poum': 'https://en.wikipedia.org/wiki/Poum',
  'bélep': 'https://en.wikipedia.org/wiki/Bélep',
  'ouégoa': 'https://en.wikipedia.org/wiki/Ouégoa',
  'pouébo': 'https://en.wikipedia.org/wiki/Pouébo',
  'hienghène': 'https://en.wikipedia.org/wiki/Hiengh%C3%A8ne',
  'touho': 'https://en.wikipedia.org/wiki/Touho',
  'poindimié': 'https://en.wikipedia.org/wiki/Poindimi%C3%A9',
  'ponérihouen': 'https://en.wikipedia.org/wiki/Ponérihouen',
  'houaïlou': 'https://en.wikipedia.org/wiki/Houaïlou',
  'kouaoua': 'https://en.wikipedia.org/wiki/Kouaoua',
  'canala': 'https://en.wikipedia.org/wiki/Canala',
  'ouvéa': 'https://en.wikipedia.org/wiki/Ouvéa',
  'lifou': 'https://en.wikipedia.org/wiki/Lifou',
  'maré': 'https://en.wikipedia.org/wiki/Mar%C3%A9'
};

/**
 * Convert a decimal degree coordinate to degrees/minutes/seconds.
 * The sign of the input determines the sign of the degrees component.
 *
 * @param {number} dec The decimal degree value.
 * @returns {[number, number, string]} An array containing degrees,
 *          minutes and seconds (string with fixed 2 decimals).
 */
function dec2dms(dec) {
  const sign = Math.sign(dec) === -1 ? -1 : 1;
  let abs = Math.abs(dec);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = (((abs - d) * 60 - m) * 60).toFixed(2);
  return [d * sign, m, s];
}

/**
 * Convert a degrees/minutes/seconds tuple to decimal degrees.
 * The sign of the degrees component controls the sign of the result.
 *
 * @param {[number, number, number]} parts Array of degrees, minutes and seconds.
 * @returns {number} The decimal representation of the coordinate.
 */
function dms2dec(parts) {
  const [deg, min, sec] = parts.map(parseFloat);
  const sign = Math.sign(deg) || 1;
  const absDeg = Math.abs(deg) + (min / 60) + (sec / 3600);
  return sign < 0 ? -absDeg : absDeg;
}

/**
 * Automatically focuses the next input field when the current field
 * reaches its maximum length.  Used for degrees/minutes/seconds inputs.
 *
 * @param {Event} e The input event.
 */
function autoTab(e) {
  const el = e.target;
  if (el.value && el.value.length >= parseInt(el.maxLength || '0', 10)) {
    let next = el.nextElementSibling;
    while (next && next.tagName !== 'INPUT') next = next.nextElementSibling;
    if (next && next.tagName === 'INPUT') next.focus();
  }
}

/**
 * Lazily load the commune GeoJSON layer.  The data is fetched only once
 * and cached in the `communeLayer` variable.  If the local file is
 * unavailable (for example when running the page from a different origin)
 * the function falls back to loading from the upstream GitHub repository.
 *
 * @returns {Promise<L.GeoJSON>} A promise resolving to the created layer.
 */
async function loadCommuneLayer() {
  if (communeLayer) return communeLayer;
  try {
    // Attempt to fetch the local copy first.
    const localResp = await fetch('data/nc-communes.geojson');
    if (localResp.ok) {
      const data = await localResp.json();
      communeLayer = L.geoJSON(data, { onEachFeature, style: defaultStyle }).addTo(map);
      return communeLayer;
    }
  } catch (err) {
    // swallow and fall back
  }
  // Fallback to remote dataset hosted on GitHub.  This should only
  // execute if the local file could not be loaded.  CORS is supported
  // by raw.githubusercontent.com.
  const remoteUrl =
    'https://raw.githubusercontent.com/rcesaret/new-caledonia-commune-locator/main/data/nc-communes.geojson';
  const resp = await fetch(remoteUrl);
  if (!resp.ok) {
    throw new Error('Failed to load commune boundaries');
  }
  const data = await resp.json();
  communeLayer = L.geoJSON(data, { onEachFeature, style: defaultStyle }).addTo(map);
  return communeLayer;
}

/**
 * Default styling for commune polygons.  A function is used instead of
 * a static object so that individual features can override the style
 * when highlighted without affecting others.
 */
function defaultStyle() {
  return {
    weight: 1,
    color: '#2a5599',
    fillColor: '#6baed6',
    fillOpacity: 0.4
  };
}

/**
 * Handler attached to each GeoJSON feature.  Assigns a click handler
 * that opens a popup displaying the commune name and a link to its
 * Wikipedia page.  Keys are normalised as described above.
 *
 * @param {Object} feature The GeoJSON feature.
 * @param {L.Layer} layer The Leaflet layer for the feature.
 */
function onEachFeature(feature, layer) {
  const name = feature.properties && feature.properties.name;
  if (!name) return;
  const key = name.replace(/['’]/g, '').toLowerCase();
  const href = wiki[key] || '#';
  layer.on('click', () => {
    layer.bindPopup(
      `<b>Commune:</b> ${name}<br><a href="${href}" target="_blank" rel="noopener">Wikipedia Page ↗</a>`
    ).openPopup();
  });
  // Attach a tooltip for quick identification
  layer.bindTooltip(name, {
    permanent: false,
    direction: 'auto',
    className: 'custom-tooltip'
  });
}

/**
 * Locate and highlight the commune that contains the specified point.
 * If no commune is found an accessible error is reported.  This
 * function automatically loads commune boundaries when needed.
 *
 * @param {number} lat Latitude of the point (−90 ≤ lat ≤ 90)
 * @param {number} lon Longitude of the point (−180 ≤ lon ≤ 180)
 */
async function locatePoint(lat, lon) {
  await loadCommuneLayer();
  if (!communeLayer) return;
  // Use leaflet‑pip to find all polygons containing the point.
  const matches = leafletPip.pointInLayer([lat, lon], communeLayer, true);
  if (matches.length > 0) {
    const feature = matches[0].feature;
    // Remove previous highlight
    if (highlightLayer) {
      map.removeLayer(highlightLayer);
    }
    // Highlight the matched commune boundary
    highlightLayer = L.geoJSON(feature, {
      style: { color: '#ffeb3b', weight: 3 }
    }).addTo(map);
    // Zoom map to bounds of highlighted area
    map.fitBounds(highlightLayer.getBounds());
  } else {
    document.getElementById('a11yMsg').textContent = 'No commune found at this location';
  }
}

/**
 * Parse the current input values and attempt to locate the point.  On
 * invalid input a message is announced to screen readers via the
 * aria‑live region.  Validations enforce latitude (±90°) and longitude
 * (±180°) ranges.
 */
function performSearch() {
  const lonInput = document.getElementById('lonBox');
  const latInput = document.getElementById('latBox');
  const a11y = document.getElementById('a11yMsg');
  a11y.textContent = '';
  const lon = parseFloat(lonInput.value);
  const lat = parseFloat(latInput.value);
  if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    locatePoint(lat, lon);
  } else {
    a11y.textContent = 'Coordinates out of range';
  }
}

/**
 * Create a set of three small inputs for degrees, minutes and seconds for
 * the given axis ("lon" or "lat") and insert them after the hidden
 * decimal input.  Values should be provided as an array.  Each mini
 * input will trigger automatic tabbing when its length is reached.
 *
 * @param {string} axis Either 'lon' or 'lat' to identify the container.
 * @param {[number, number, string]} values Initial DMS values.
 */
function createDmsInputs(axis, values) {
  const container = document.createElement('div');
  container.dataset.axis = axis;
  container.style.display = 'flex';
  container.style.gap = '4px';
  container.style.alignItems = 'center';
  values.forEach((val) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = val;
    input.maxLength = 2;
    input.style.width = '3em';
    container.appendChild(input);
  });
  // Attach auto‑tab to each mini input
  Array.from(container.querySelectorAll('input')).forEach((inp) => {
    inp.maxLength = 2;
    inp.addEventListener('input', autoTab);
  });
  const ref = document.getElementById(axis === 'lon' ? 'lonBox' : 'latBox');
  ref.parentNode.insertBefore(container, ref.nextSibling);
}

// Initialise the application once the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Create the map centred on New Caledonia
  map = L.map('map').setView([-21.5, 165.5], 8);
  // Base tile layers
  const lightTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  });
  const darkTiles = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  });
  lightTiles.addTo(map);
  // Theme toggle behaviour
  document.getElementById('themeToggle').addEventListener('click', () => {
    darkMode = !darkMode;
    if (darkMode) {
      map.removeLayer(lightTiles);
      darkTiles.addTo(map);
    } else {
      map.removeLayer(darkTiles);
      lightTiles.addTo(map);
    }
  });
  // Add the custom info control to the map
  const InfoControl = L.Control.extend({
    onAdd: function () {
      const div = L.DomUtil.create('div', 'info-box');
      div.innerHTML = `
        <button id='infoToggle' aria-label='Show information'>ℹ︎</button>
        <div id='infoPanel' hidden>
          <h2>How to use</h2>
          <ol>
            <li>Enter longitude (X) and latitude (Y) in decimal format. Use the °′″ button to switch between decimal and degrees/minutes/seconds.</li>
            <li>Click <strong>Search</strong> or press <strong>Enter</strong> to locate the point.</li>
            <li>Click any commune on the map to display its name and a link to its Wikipedia page.</li>
            <li>Use the <strong>🔗 Copy Link</strong> button to generate a shareable permalink for the current coordinates.</li>
            <li>Toggle dark mode with the <strong>🌙</strong> button.</li>
            <li>Keyboard shortcuts: Ctrl+L (or Cmd+L) focuses the longitude field; Enter triggers a search.</li>
          </ol>
          <hr>
          <small>© 2025 Rudolf Cesaretti &amp; Maja Canavan • <a href='https://github.com/rcesaret/new-caledonia-commune-locator' target='_blank' rel='noopener'>Source on GitHub</a></small>
        </div>`;
      // Toggle the visibility of the info panel
      div.querySelector('#infoToggle').onclick = () => {
        const panel = div.querySelector('#infoPanel');
        panel.toggleAttribute('hidden');
      };
      return div;
    }
  });
  map.addControl(new InfoControl({ position: 'topright' }));
  // Attach search button handler
  document.getElementById('searchButton').addEventListener('click', performSearch);
  // Keyboard shortcuts: Ctrl/Cmd+L focuses longitude, Enter triggers search
  document.addEventListener('keydown', (e) => {
    const lonBox = document.getElementById('lonBox');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      lonBox.focus();
    }
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  // Copy permalink handler
  const copyBtn = document.getElementById('copyLink');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const lonVal = document.getElementById('lonBox').value;
      const latVal = document.getElementById('latBox').value;
      const url = `${location.origin}${location.pathname}#lat=${latVal}&lon=${lonVal}`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied!');
      });
    };
  }
  // Deep link: parse hash parameters on initial load
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const latHash = hashParams.get('lat');
  const lonHash = hashParams.get('lon');
  if (latHash && lonHash) {
    document.getElementById('latBox').value = latHash;
    document.getElementById('lonBox').value = lonHash;
    performSearch();
  }
  // DMS/decimal toggle
  let usingDMS = false;
  document.getElementById('toggleFormat').addEventListener('click', () => {
    const lonBox = document.getElementById('lonBox');
    const latBox = document.getElementById('latBox');
    if (!usingDMS) {
      // Switch to DMS inputs
      usingDMS = true;
      const lonVal = parseFloat(lonBox.value) || 0;
      const latVal = parseFloat(latBox.value) || 0;
      const [lonD, lonM, lonS] = dec2dms(lonVal);
      const [latD, latM, latS] = dec2dms(latVal);
      lonBox.style.display = 'none';
      latBox.style.display = 'none';
      createDmsInputs('lon', [lonD, lonM, lonS]);
      createDmsInputs('lat', [latD, latM, latS]);
    } else {
      // Convert back to decimals
      usingDMS = false;
      const lonInputs = document.querySelectorAll('[data-axis="lon"] input');
      const latInputs = document.querySelectorAll('[data-axis="lat"] input');
      if (lonInputs.length === 3 && latInputs.length === 3) {
        const lonDec = dms2dec([
          parseFloat(lonInputs[0].value) || 0,
          parseFloat(lonInputs[1].value) || 0,
          parseFloat(lonInputs[2].value) || 0
        ]);
        const latDec = dms2dec([
          parseFloat(latInputs[0].value) || 0,
          parseFloat(latInputs[1].value) || 0,
          parseFloat(latInputs[2].value) || 0
        ]);
        lonBox.value = lonDec.toFixed(6);
        latBox.value = latDec.toFixed(6);
      }
      // Remove mini inputs and reveal decimal boxes
      document.querySelectorAll('[data-axis="lon"], [data-axis="lat"]').forEach((div) => div.remove());
      lonBox.style.display = '';
      latBox.style.display = '';
    }
  });
  // Immediately load commune boundaries (lazy load will cache) but
  // do not await so the UI remains responsive.
  loadCommuneLayer().catch((err) => {
    console.error(err);
    document.getElementById('a11yMsg').textContent = 'Unable to load commune boundaries';
  });
});