/*
 * Main application script for the commune locator map.
 *
 * This script initializes a Leaflet map centred on New Caledonia and
 * asynchronously loads commune boundaries from the geojson file
 * stored in the `data` directory.  Polygons are rendered with
 * tooltips showing commune names.  Users can search for a
 * point by entering latitude and longitude separated by a comma or
 * by typing part of a commune name.  When a match is found the
 * corresponding commune polygon is highlighted and the map zooms to
 * reveal it.  If no match is found the user is notified via a simple
 * alert.
 */

// Global variables to hold the map, the geoJSON layer and the
// currently highlighted feature.  Declared in outer scope so they can
// be referenced from multiple functions.
let map;
let communesLayer;
let highlightedLayer = null;

// Initialise the map once the DOM is ready.  We wrap this in an
// immediately invoked function expression (IIFE) to avoid leaking
// variables into the global scope.
(function initializeMap() {
  // Create the map centred roughly on New Caledonia.  The original
  // project used the same centre and zoom level【894404182387996†L45-L50】.
  map = L.map('map').setView([-21.5, 165.5], 8);

  // Add the OpenStreetMap tile layer.  Attribution is required per
  // OSM’s licence【894404182387996†L45-L50】.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Once the base map is ready, load the commune data.  We use the
  // Fetch API here rather than embedding the geojson directly in the
  // HTML.  This keeps the HTML lean and allows the data to be cached
  // independently by the browser.
  loadCommunes();

  // Attach search handlers
  const searchBtn = document.getElementById('searchButton');
  const searchInput = document.getElementById('searchBox');
  searchBtn.addEventListener('click', performSearch);
  // Support pressing Enter in the input field
  searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
})();

/**
 * Fetch the commune GeoJSON file and add it to the map.
 * Each feature will have a tooltip showing its name.
 */
function loadCommunes() {
  // Use a relative path with a leading "./" so that browsers loading
  // this page from the file system resolve it correctly.  Without
  // the prefix some browsers fail to find the file when loaded via
  // the file protocol.
  fetch('./data/nc-communes.geojson')
    .then(function (response) {
      if (!response.ok) throw new Error('Failed to load geoJSON');
      return response.json();
    })
    .then(function (data) {
      // Create a GeoJSON layer with custom styling
      communesLayer = L.geoJSON(data, {
        style: function () {
          return {
            weight: 1,
            color: '#2a5599',
            fillColor: '#6baed6',
            fillOpacity: 0.4
          };
        },
        onEachFeature: function (feature, layer) {
          if (feature.properties && feature.properties.name) {
            // Bind a tooltip to display the commune name
            layer.bindTooltip(feature.properties.name, {
              permanent: false,
              direction: 'auto',
              className: 'custom-tooltip'
            });
          }
        }
      });
      communesLayer.addTo(map);
    })
    .catch(function (err) {
      console.error(err);
      alert('Unable to load commune boundaries.');
    });
}

/**
 * Perform a search based on the value of the search box.  Supports two
 * formats: 1) latitude,longitude (comma separated); 2) commune name.
 */
function performSearch() {
  const query = document.getElementById('searchBox').value.trim();
  if (!query) return;

  // Test for coordinates: optional minus sign, digits, optional decimals,
  // then a comma and the same for longitude.  White‑space around the
  // comma is permitted.
  const coordRegex = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;
  if (coordRegex.test(query)) {
    const parts = query.split(',');
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    locatePoint(lat, lng);
  } else {
    locateByName(query);
  }
}

/**
 * Locate and highlight the commune that contains the given point.
 *
 * @param {number} lat Latitude of the point
 * @param {number} lng Longitude of the point
 */
function locatePoint(lat, lng) {
  if (!communesLayer) return;
  const point = [lat, lng];
  // Use leaflet‑pip to find all polygons containing the point.  The
  // `true` argument returns an array of actual Leaflet layers.
  const matches = leafletPip.pointInLayer(point, communesLayer, true);
  if (matches.length > 0) {
    highlightLayer(matches[0]);
    // Zoom to and centre on the found feature
    map.fitBounds(matches[0].getBounds());
    L.popup()
      .setLatLng(point)
      .setContent(matches[0].feature.properties.name)
      .openOn(map);
  } else {
    alert('No commune found at this location.');
  }
}

/**
 * Locate and highlight a commune by name.  Performs a case
 * insensitive substring search across all commune names.
 *
 * @param {string} name The name or partial name of the commune to search for
 */
function locateByName(name) {
  if (!communesLayer) return;
  let foundLayer = null;
  const searchName = name.toLowerCase();
  communesLayer.eachLayer(function (layer) {
    const communeName = (layer.feature.properties.name || '').toLowerCase();
    if (communeName.includes(searchName)) {
      foundLayer = layer;
    }
  });
  if (foundLayer) {
    highlightLayer(foundLayer);
    map.fitBounds(foundLayer.getBounds());
    foundLayer.openTooltip();
  } else {
    alert('Commune not found: ' + name);
  }
}

/**
 * Apply highlight styling to the given layer and remove any previous
 * highlight.  Leaflet provides a `resetStyle` method on GeoJSON
 * layers that restores the original style function.
 *
 * @param {L.Layer} layer The layer to highlight
 */
function highlightLayer(layer) {
  // Remove previous highlight
  if (highlightedLayer && communesLayer) {
    communesLayer.resetStyle(highlightedLayer);
  }
  highlightedLayer = layer;
  layer.setStyle({
    weight: 3,
    color: '#ff7800',
    fillColor: '#ffefa0',
    fillOpacity: 0.6
  });
}