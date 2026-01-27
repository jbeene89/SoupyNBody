# SoupyNBody Web

Browser-based N-body galaxy simulator using Three.js/WebGL.

## Features

- Real-time gravitational simulation
- Works on integrated graphics (Intel HD, etc.)
- Galaxy collision mode
- Adjustable time scale and galaxy size
- Mobile-friendly

## Deploy to Netlify

1. Fork/clone this repo
2. In Netlify: **New site** → **Import from Git**
3. Set **Base directory**: `apps/web`
4. Set **Publish directory**: `apps/web`
5. Deploy!

Or use the Netlify CLI:

```bash
cd apps/web
npx netlify deploy --prod
```

## Run Locally

Just open `index.html` in a browser, or use a local server:

```bash
cd apps/web
python -m http.server 8000
# Open http://localhost:8000
```

## Controls

- **Drag** - Rotate camera
- **Scroll** - Zoom in/out
- **Pause** - Stop/resume simulation
- **Reset** - Reinitialize single galaxy
- **Collision** - Start two-galaxy collision

## Technical Notes

- Uses central-mass approximation for performance (not full N-body)
- Optimized for 10,000 particles on integrated graphics
- Three.js r160 via CDN (no build step required)
