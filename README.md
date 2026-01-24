# SoupyNBody

SoupyNBody is a modern N‑body galaxy simulator designed to run on a variety of platforms.
It separates physics computation from rendering so that you can experiment with different
integration schemes and hardware back‑ends while reusing the same rendering pipeline.

## Features

* **Modular design** – physics engines live in `core/physics`, render code lives in
  `core/render`, and high‑level apps live under `apps/`.
* **Multiple modes** – choose between a fast, GPU‑powered compute shader for desktop
  systems and a simplified orbit‑enforcing mode for mobile hardware.
* **Extensible** – the project is structured so you can add new integration schemes,
  shader effects or target platforms without rewriting your simulation.

## Project layout

```
SoupyNBody/
├── apps/             # Entry points for different platforms
│   ├── desktop_gl/   # ModernGL desktop implementation
│   │   └── main.py
│   ├── ue5_niagara/  # Placeholder for Unreal Engine Niagara integration
│   └── webgpu/       # Placeholder for future WebGPU version
├── core/
│   ├── physics/      # Force computations and integration schemes
│   ├── render/       # Colour maps, camera utilities, etc.
│   └── shared/       # Shared configuration and type definitions
├── shaders/
│   ├── glsl/         # GLSL shaders used by the desktop implementation
│   └── hlsl/         # HLSL kernels for the UE5 Niagara version
├── assets/           # Textures, presets and example configurations
└── docs/             # Documentation and guides
```

To run the desktop version:

```sh
pip install moderngl moderngl-window numpy
python apps/desktop_gl/main.py
```

The simulation will automatically detect and use your GPU if available.
If your GPU does not support compute shaders or you want to run on a mobile
device, you can choose a simplified physics mode by setting the `PHYSICS_MODE`
environment variable to `simple`.

See `docs/ue5_setup.md` for instructions on using the Niagara version in
Unreal Engine 5.
