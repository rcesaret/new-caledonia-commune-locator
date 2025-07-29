/*
 * New Caledonia Commune Locator — Enhanced application script
 * -----------------------------------------------------------------
 * Responsibilities
 *   - Initialize Leaflet map and load commune GeoJSON
 *   - Render commune boundaries with hover highlight and center labels
 *   - Provide four coordinate input modes (single decimal, dual decimal,
 *     DMS boxes, single DMS string) with a flip button for dual inputs
 *   - Convert DMS inputs to decimal degrees and validate ranges
 *   - Drop a marker at any entered coordinate and perform point‑in‑polygon lookup
 *   - Maintain support for commune name search in single decimal mode
 */

// ---- Configuration ----
const MAP_CENTER = [-21.5, 165.5];
const MAP_ZOOM   = 8;
const GEOJSON_URL = 'data/nc-communes.geojson';
const OFFLINE_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wIAAgUBBu/q6QAAAABJRU5ErkJggg==';

// Attempt to create a tile layer from OpenStreetMap. Fallback to a blank tile
// if network access is blocked.
async function createTileLayer() {
  try {
    const resp = await fetch('https://tile.openstreetmap.org/0/0/0.png', {
      mode: 'no-cors',
      signal: AbortSignal.timeout(5000) // 5-second timeout
    });
    // For 'no-cors', a successful network request results in an 'opaque' response.
    if (resp.type === 'opaque') {
      return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '\u00A9 OpenStreetMap contributors'
      });
    }
    console.warn(`Unexpected response from tile server: type ${resp.type}`);
  } catch (err) {
    console.warn('Tile server unreachable, using offline tile:', err.message);
  }
  return L.tileLayer(OFFLINE_TILE, { maxZoom: 19, attribution: '' });
}

// ---- Map ----
const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
createTileLayer().then(layer => layer.addTo(map));

let communeLayer = null;
let activeMarker = null;

// Custom red marker icon for coordinate entries
const coordinateMarkerIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Normalization helper (remove diacritics, lowercase)
const normalize = (s) => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

// Lightweight toast utility
function showToast(msg, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); }, ms);
}

// Announce to screen readers
function announce(msg) {
  const status = document.getElementById('status');
  if (status) status.textContent = msg;
}
// ---- Load GeoJSON ----
function loadCommuneData() {
  return fetch(GEOJSON_URL)
    .then(r => r.json())
    .catch(err => {
      console.error('GeoJSON fetch failed:', err);
      return (typeof COMMUNES_DATA !== 'undefined') ? COMMUNES_DATA : null;
    });
}

loadCommuneData().then(fc => {
    if (!fc || !Array.isArray(fc.features)) {
      showToast('Failed to parse communes data.');
      return;
    }
    if (fc.features.length === 0) {
      showToast('No commune polygons found — load the dataset to enable lookups.');
    }

    communeLayer = L.geoJSON(fc, {
      style: () => ({
        color: '#228B22',       // border
        weight: 1.6,
        fillColor: '#66BB66',   // fill
        fillOpacity: 0.35
      }),
      onEachFeature: (feature, layer) => {
        const name = feature?.properties?.name || 'Unknown commune';
        layer.bindTooltip(name, { direction: 'center', className: 'custom-tooltip' });
        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ fillColor: '#FFD54F', color: '#FB8C00', weight: 2.2, fillOpacity: 0.55 });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) l.bringToFront();
          },
          mouseout: (e) => {
            communeLayer.resetStyle(e.target);
          }
        });
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error('GeoJSON load error:', err);
    showToast('Error loading communes data.');
  });

// ---- DOM references ----
// Mode buttons
const modeSingleDecBtn  = document.getElementById('modeSingleDecBtn');
const modeDualDecBtn    = document.getElementById('modeDualDecBtn');
const modeDMSBoxesBtn   = document.getElementById('modeDMSBoxesBtn');
const modeSingleDmsBtn  = document.getElementById('modeSingleDmsBtn');

// Input containers
const singleDecInputs       = document.getElementById('singleDecInputs');
const dualDecInputs         = document.getElementById('dualDecInputs');
const dmsBoxesInputs        = document.getElementById('dmsBoxesInputs');
const singleDmsInputContainer = document.getElementById('singleDmsInputContainer');

// Input fields
const singleDecInput  = document.getElementById('singleDecInput');
const latDecInput     = document.getElementById('latDecInput');
const lonDecInput     = document.getElementById('lonDecInput');
const flipDecBtn      = document.getElementById('flipDecBtn');
const latDMSDeg       = document.getElementById('latDMSDeg');
const latDMSMin       = document.getElementById('latDMSMin');
const latDMSSec       = document.getElementById('latDMSSec');
const lonDMSDeg       = document.getElementById('lonDMSDeg');
const lonDMSMin       = document.getElementById('lonDMSMin');
const lonDMSSec       = document.getElementById('lonDMSSec');
const singleDmsInput  = document.getElementById('singleDmsInput');

const locateBtn = document.getElementById('locateBtn');
const clearBtn  = document.getElementById('clearBtn');

// Mode identifiers
const MODE_SINGLE_DEC  = 'singleDec';
const MODE_DUAL_DEC    = 'dualDec';
const MODE_DMS_BOXES   = 'dmsBoxes';
const MODE_SINGLE_DMS  = 'singleDms';

let currentMode = MODE_SINGLE_DEC;

// Set the active mode visually and logically
function setMode(mode) {
  currentMode = mode;
  // update aria-pressed and aria-checked on buttons for accessibility
  const btns = [modeSingleDecBtn, modeDualDecBtn, modeDMSBoxesBtn, modeSingleDmsBtn];
  const activeBtn = getButtonForMode(mode);
  btns.forEach(btn => {
    const active = (btn === activeBtn);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  // show/hide input groups depending on the selected mode
  singleDecInputs.hidden         = (mode !== MODE_SINGLE_DEC);
  dualDecInputs.hidden           = (mode !== MODE_DUAL_DEC);
  dmsBoxesInputs.hidden          = (mode !== MODE_DMS_BOXES);
  singleDmsInputContainer.hidden = (mode !== MODE_SINGLE_DMS);
}

function getButtonForMode(mode) {
  switch (mode) {
    case MODE_SINGLE_DEC: return modeSingleDecBtn;
    case MODE_DUAL_DEC:   return modeDualDecBtn;
    case MODE_DMS_BOXES:  return modeDMSBoxesBtn;
    case MODE_SINGLE_DMS: return modeSingleDmsBtn;
    default: return modeSingleDecBtn;
  }
}

// Set initial mode
setMode(currentMode);

// Mode button event handlers
modeSingleDecBtn.addEventListener('click', () => setMode(MODE_SINGLE_DEC));
modeDualDecBtn.addEventListener('click',   () => setMode(MODE_DUAL_DEC));
modeDMSBoxesBtn.addEventListener('click',  () => setMode(MODE_DMS_BOXES));
modeSingleDmsBtn.addEventListener('click', () => setMode(MODE_SINGLE_DMS));

// Flip button handler: swap latitude and longitude values in dual decimal mode
flipDecBtn.addEventListener('click', () => {
  const latVal = latDecInput.value.trim();
  const lonVal = lonDecInput.value.trim();
  if (latVal && lonVal) {
    latDecInput.value = lonVal;
    lonDecInput.value = latVal;
  } else if (latVal && !lonVal) {
    lonDecInput.value = latVal;
    latDecInput.value = '';
  } else if (!latVal && lonVal) {
    latDecInput.value = lonVal;
    lonDecInput.value = '';
  }
  // Show visual feedback
  showToast('Coordinates flipped');
});

// Locate on Enter key for any visible input
[singleDecInput, latDecInput, lonDecInput, latDMSDeg, latDMSMin, latDMSSec, lonDMSDeg, lonDMSMin, lonDMSSec, singleDmsInput].forEach(input => {
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleLocate();
      }
    });
  }
});

// Locate button handler
locateBtn.addEventListener('click', handleLocate);

// Clear button handler: clear marker and all inputs
clearBtn.addEventListener('click', () => {
  clearInputs();
  clearSelection();
});

function clearInputs() {
  // Clear all known input fields
  singleDecInput.value = '';
  latDecInput.value    = '';
  lonDecInput.value    = '';
  latDMSDeg.value      = '';
  latDMSMin.value      = '';
  latDMSSec.value      = '';
  lonDMSDeg.value      = '';
  lonDMSMin.value      = '';
  lonDMSSec.value      = '';
  singleDmsInput.value = '';
}

function clearSelection() {
  if (activeMarker) {
    map.removeLayer(activeMarker);
    activeMarker = null;
  }
  announce('Selection cleared');
}

// -----------------------------------------------------------------------------
// Input validation helpers

/**
 * Parse a string into a floating‑point number. Returns null if parsing fails.
 */
function parseNumber(str) {
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate latitude and longitude values. Returns error message or null.
 */
function validateLatLon(lat, lon) {
  if (lat === null || lon === null) return 'Could not parse coordinates.';
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return 'Latitude must be in [-90,90] and longitude in [-180,180].';
  }
  return null;
}

// Primary locate handler: dispatch based on current mode
const locateHandlers = {};

function handleLocate() {
  const handler = locateHandlers[currentMode] || locateFromSingleDec;
  handler();
}

// Single decimal input: lat,lng comma separated OR name search
function locateFromSingleDec() {
  const raw = singleDecInput.value.trim();
  if (!raw) return;
  // Try coord first: "lat,lng" with optional whitespace
  const m = raw.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = parseNumber(m[1]);
    const lng = parseNumber(m[2]);
    const err = validateLatLon(lat, lng);
    if (err) {
      showToast(err);
      return;
    }
    identifyAt(lat, lng, true);
    return;
  }
  // Fallback: name search (accent/case-insensitive substring)
  searchByName(raw);
}

// Dual decimal input: separate lat and lon fields
function locateFromDualDec() {
  const latStr = latDecInput.value.trim();
  const lonStr = lonDecInput.value.trim();
  if (!latStr || !lonStr) {
    showToast('Please enter both latitude and longitude.');
    return;
  }
  const lat = parseNumber(latStr);
  const lon = parseNumber(lonStr);
  const err = validateLatLon(lat, lon);
  if (err) {
    showToast(err);
    return;
  }
  identifyAt(lat, lon, true);
}

// DMS boxes input: convert degrees/minutes/seconds to decimal
function locateFromDmsBoxes() {
  const latDegStr = latDMSDeg.value.trim();
  const latMinStr = latDMSMin.value.trim();
  const latSecStr = latDMSSec.value.trim();
  const lonDegStr = lonDMSDeg.value.trim();
  const lonMinStr = lonDMSMin.value.trim();
  const lonSecStr = lonDMSSec.value.trim();
  // Require at least degrees for both lat and lon
  if (!latDegStr || !lonDegStr) {
    showToast('Degrees are required for both latitude and longitude.');
    return;
  }
  const latDeg = parseFloat(latDegStr);
  const latMin = latMinStr ? parseFloat(latMinStr) : 0;
  const latSec = latSecStr ? parseFloat(latSecStr) : 0;
  const lonDeg = parseFloat(lonDegStr);
  const lonMin = lonMinStr ? parseFloat(lonMinStr) : 0;
  const lonSec = lonSecStr ? parseFloat(lonSecStr) : 0;
  if ([latDeg, latMin, latSec, lonDeg, lonMin, lonSec].some(n => !Number.isFinite(n))) {
    showToast('Invalid DMS values.');
    return;
  }
  // Validate minutes/seconds ranges
  if (latMin < 0 || latMin >= 60 || latSec < 0 || latSec >= 60 || lonMin < 0 || lonMin >= 60 || lonSec < 0 || lonSec >= 60) {
    showToast('Minutes and seconds must be in [0,60).');
    return;
  }
  // Convert to absolute degrees and sign
  const latSign = latDeg < 0 ? -1 : 1;
  const lonSign = lonDeg < 0 ? -1 : 1;
  const latDec = latSign * (Math.abs(latDeg) + latMin / 60 + latSec / 3600);
  const lonDec = lonSign * (Math.abs(lonDeg) + lonMin / 60 + lonSec / 3600);
  const err = validateLatLon(latDec, lonDec);
  if (err) {
    showToast(err);
    return;
  }
  identifyAt(latDec, lonDec, true);
}

// Single DMS string input: parse google maps style "20°44'19.7"S 164°47'41.6"E"
function locateFromSingleDms() {
  const raw = singleDmsInput.value.trim();
  if (!raw) return;
  // Regex to capture two DMS coordinate groups
  const pattern = /([\-]?\d+(?:\.\d+)?)\s*°\s*([\d\.]+)?\s*(?:'|′)?\s*([\d\.]+)?\s*(?:"|″)?\s*([NSEW])/ig;
  const matches = [];
  let m;
  while ((m = pattern.exec(raw)) !== null) {
    matches.push(m);
  }
  if (matches.length < 2) {
    showToast('Could not parse DMS string. Expect format like 20°44\'19.7"S 164°47\'41.6"E');
    return;
  }
  // Extract lat and lon from first two matches
  const latMatch = matches[0];
  const lonMatch = matches[1];
  const latDecVal = dmsMatchToDecimal(latMatch);
  const lonDecVal = dmsMatchToDecimal(lonMatch);
  if (latDecVal == null || lonDecVal == null) {
    showToast('Invalid DMS values in input.');
    return;
  }
  const err = validateLatLon(latDecVal, lonDecVal);
  if (err) {
    showToast(err);
    return;
  }
  identifyAt(latDecVal, lonDecVal, true);
}

// Convert regex match groups to decimal degrees
function dmsMatchToDecimal(match) {
  // match indices: 1=deg,2=min,3=sec,4=dir
  const deg = parseFloat(match[1]);
  const min = match[2] ? parseFloat(match[2]) : 0;
  const sec = match[3] ? parseFloat(match[3]) : 0;
  const dir = match[4].toUpperCase();
  if (![deg, min, sec].every(n => Number.isFinite(n))) return null;
  if (min < 0 || min >= 60 || sec < 0 || sec >= 60) return null;
  let dec = Math.abs(deg) + min / 60 + sec / 3600;
  // Determine sign: use sign of degrees if negative, otherwise direction
  if (deg < 0) {
    dec = -dec;
  } else {
    if (dir === 'S' || dir === 'W') dec = -dec;
  }
  return dec;
}

// Click-to-identify on map: drop marker
map.on('click', (e) => identifyAt(e.latlng.lat, e.latlng.lng, true));

// ENHANCED: Identify commune at given lat/lng with improved marker visibility
function identifyAt(lat, lng, dropMarker = false) {
  map.setView([lat, lng], Math.max(map.getZoom(), 11));

  let popupText = 'No commune found at this location.';
  if (communeLayer) {
    // leaflet-pip expects [lng, lat]
    try {
      const hits = leafletPip.pointInLayer([lng, lat], communeLayer, true);
      if (hits.length) {
        const feature = hits[0].feature || {};
        const name = feature?.properties?.name || 'Unknown commune';
        popupText = `Commune: ${name}`;
      }
    } catch (err) {
      console.error('leaflet-pip error:', err);
    }
  }
  
  if (dropMarker) {
    // Remove existing marker
    if (activeMarker) map.removeLayer(activeMarker);
    
    // Create distinctive red marker for entered coordinates
    activeMarker = L.marker([lat, lng], {
      icon: coordinateMarkerIcon
    }).addTo(map);
    
    // Enhanced popup with coordinates and commune info
    const coordText = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const fullPopupText = `${coordText}<br>${popupText}`;
    activeMarker.bindPopup(fullPopupText, { className: 'coordinate-popup' }).openPopup();
    
    // Ensure marker is visible by bringing it to front
    activeMarker.setZIndexOffset(1000);
  } else {
    showToast(popupText);
  }
  announce(popupText);
}

// Name search: accent/case-insensitive substring search over communeLayer
function searchByName(raw) {
  if (!communeLayer) {
    showToast('Data not loaded yet.');
    return;
  }
  const q = normalize(raw);
  let matchLayer = null;
  communeLayer.eachLayer(layer => {
    if (matchLayer) return; // early exit after first match
    const name = layer.feature?.properties?.name || '';
    if (normalize(name).includes(q)) matchLayer = layer;
  });
  if (!matchLayer) {
    showToast('No match found.');
    announce('No match found');
    return;
  }
  const { name } = matchLayer.feature.properties;
  map.fitBounds(matchLayer.getBounds());
  matchLayer.bindPopup(`Commune: ${name}`).openPopup();
  announce(`Found commune: ${name}`);
}

// Register locate handlers
locateHandlers[MODE_SINGLE_DEC] = locateFromSingleDec;
locateHandlers[MODE_DUAL_DEC]   = locateFromDualDec;
locateHandlers[MODE_DMS_BOXES]  = locateFromDmsBoxes;
locateHandlers[MODE_SINGLE_DMS] = locateFromSingleDms;
