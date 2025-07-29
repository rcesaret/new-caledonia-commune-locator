# New Caledonia Commune Locator

Leaflet-based web app to identify the **commune (municipality)** of New Caledonia for any coordinate.
Enter `lat,lng` or search by name (accent-insensitive). Uses precise point-in-polygon via `leaflet-pip`.
The app now includes a layer panel to toggle commune styling, switch base maps and add custom points.

- **Live site:** https://rcesaret.github.io/nc-commune-locator/
- **Tech:** Leaflet, leaflet-pip, vanilla JS
- **Data:** `data/nc-communes.geojson` (GeoJSON MultiPolygon features with `properties.name`)

## Directory layout

```
new-caledonia-commune-locator/
├─ index.html
├─ assets/
│  ├─ css/
│  │  └─ styles.css
│  └─ js/
│     └─ app.js
├─ data/
│  └─ nc-communes.geojson
├─ LICENSE
└─ README.md
```

## Quick Start (local)
```bash
python -m http.server 8000
# open http://localhost:8000
```

## Usage

* Enter coordinates as `-21.5, 165.5` (decimal degrees); the app returns the commune via point-in-polygon.
* Or type a commune name (case/diacritic-insensitive) to zoom and popup the boundary.
* Use the 🐌 button to toggle lazy loading of commune polygons.
* Open the layer panel (left) to style commune borders/fill, switch basemaps and add custom points. Points can be exported as GeoJSON.

## Development Notes

* Coordinate order: Leaflet APIs use `[lat, lng]`; `leaflet-pip` expects `[lng, lat]`.
* Keep only one GeoJSON layer (`communeLayer`) to avoid duplicate tooltips and performance issues.
* Validate lat/lng ranges to avoid invalid inputs.

## Data & License

* **Code:** MIT License (see `LICENSE`).
* **Data:** Add your data source and license here (e.g., CC BY 4.0). Ensure compatibility for redistribution.

---
