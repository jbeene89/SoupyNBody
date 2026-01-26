# Unreal Engine 5 Niagara Galaxy Simulator

Complete guide for setting up a real-time N-body galaxy simulation in Unreal Engine 5 using Niagara.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Option A: Real-time GPU Simulation](#option-a-real-time-gpu-simulation)
4. [Option B: Pre-baked REBOUND Data](#option-b-pre-baked-rebound-data)
5. [Niagara System Setup](#niagara-system-setup)
6. [HLSL Shader Integration](#hlsl-shader-integration)
7. [Material Setup](#material-setup)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)

---

## Overview

SoupyNBody provides two approaches for UE5 integration:

### Option A: Real-time GPU Simulation
- Uses HLSL compute shaders in Niagara
- Full N-body gravitational physics on GPU
- Interactive and dynamic
- Best for: Desktop/Console, moderate particle counts (1K-50K)

### Option B: Pre-baked REBOUND Data
- Uses REBOUND library for accurate physics pre-computation
- Imports cached animation data into Niagara
- Scientifically accurate
- Best for: Cinematics, high particle counts (50K-500K+), mobile/VR

---

## Prerequisites

- **Unreal Engine 5.1+** (5.3+ recommended for best Niagara features)
- **GPU with Compute Shader support** (any modern discrete GPU)
- For Option B: Python 3.8+ with REBOUND and SoupyNBody

---

## Option A: Real-time GPU Simulation

### Step 1: Create the Niagara System

1. In Content Browser: **Right-click → Niagara → Niagara System**
2. Select **"New system from selected emitter(s)"**
3. Choose **"Empty"** as the template
4. Name it `NS_GalaxySimulation`

### Step 2: Configure the Emitter

1. Open the Niagara System
2. Add a new emitter: **Right-click → Add Emitter → Empty**
3. Name it `Galaxy_Particles`

#### Emitter Properties:
```
Sim Target: GPUCompute Sim
Fixed Bounds: Enable (set to galaxy radius * 2)
Requires Persistent IDs: Enable
```

### Step 3: Add Required Modules

#### System Settings:
- **System State** → Set to `Active`

#### Emitter Settings:
```
Emitter Spawn:
  └── Spawn Burst Instantaneous
      └── Spawn Count: 10000 (adjust as needed)

Particle Spawn:
  └── Initialize Particle (Custom HLSL - see below)
  └── Add Velocity (set to 0,0,0 - will be set by init)

Particle Update:
  └── N-Body Simulation (Custom HLSL - see below)
  └── Update Age
  └── Particle State

Render:
  └── Sprite Renderer
      └── Material: M_GalaxyParticle (see Material Setup)
      └── Sprite Size Mode: Custom
      └── Sprite Size Binding: Particles.SpriteSize
```

### Step 4: Add User Parameters

In the **User Exposed** section, add these parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| NumParticles | int32 | 10000 | Total particle count |
| GravitationalConstant | float | 1.0 | G constant |
| Softening | float | 0.1 | Prevents singularities |
| CentralMass | float | 1000000 | Central black hole mass |
| GalaxyRadius | float | 1500.0 | Galaxy radius (UE units = cm) |
| TimeScale | float | 1.0 | Simulation speed multiplier |

### Step 5: Add Custom HLSL Modules

#### Galaxy Initialization Module

Create a new **Scratch Pad Module** for initialization:

```hlsl
// Module: Initialize Galaxy Particle
// Inputs: ParticleIndex (int), NumParticles (int), GalaxyRadius (float),
//         CentralMass (float), G (float)

void InitializeGalaxyParticle(
    in int ParticleIndex,
    in int NumParticles,
    in float GalaxyRadius,
    in float CentralMass,
    in float G,
    out float3 Position,
    out float3 Velocity,
    out float Mass,
    out float4 Color
)
{
    // Seed random based on particle index
    float seed = float(ParticleIndex) / float(NumParticles);

    // Central mass at index 0
    if (ParticleIndex == 0)
    {
        Position = float3(0, 0, 0);
        Velocity = float3(0, 0, 0);
        Mass = CentralMass;
        Color = float4(1.0, 0.95, 0.8, 1.0); // Bright core
        return;
    }

    // Exponential disk distribution
    float u = frac(sin(seed * 12345.6789) * 43758.5453);
    float r = -GalaxyRadius * 0.3 * log(1.0 - u * 0.95);
    r = clamp(r, 10.0, GalaxyRadius);

    float theta = frac(sin(seed * 67890.1234) * 98765.4321) * 6.28318;

    // Position
    Position.x = r * cos(theta);
    Position.y = r * sin(theta);
    Position.z = (frac(sin(seed * 11111.1111) * 22222.2222) - 0.5) * GalaxyRadius * 0.05;

    // Circular orbital velocity
    float vCirc = sqrt(G * CentralMass / r);
    float dispersion = 0.1 * vCirc;

    Velocity.x = -vCirc * sin(theta) + dispersion * (frac(sin(seed * 33333.3333) * 44444.4444) - 0.5);
    Velocity.y = vCirc * cos(theta) + dispersion * (frac(sin(seed * 55555.5555) * 66666.6666) - 0.5);
    Velocity.z = dispersion * 0.5 * (frac(sin(seed * 77777.7777) * 88888.8888) - 0.5);

    // Mass (uniform for disk particles)
    Mass = 1.0;

    // Color based on radius
    float t = r / GalaxyRadius;
    Color = lerp(float4(0.9, 0.7, 1.0, 1.0), float4(0.3, 0.4, 0.8, 0.6), t);
}
```

#### N-Body Simulation Module

Create a **Simulation Stage** with this HLSL:

```hlsl
// Module: N-Body Gravitational Simulation
// This runs as a GPU Simulation Stage

// Note: For full implementation, copy from shaders/hlsl/nbody_compute.hlsl
// The compute shader uses shared memory tiling for optimal performance

void NBodySimulation(
    in float3 MyPosition,
    in float3 MyVelocity,
    in float MyMass,
    in float DeltaTime,
    in float G,
    in float Softening,
    in float3 CentralPosition,
    in float CentralMass,
    out float3 NewPosition,
    out float3 NewVelocity
)
{
    // Simplified: Only central mass gravity (for performance)
    // For full N-body, use the compute shader approach

    float3 r = CentralPosition - MyPosition;
    float distSq = dot(r, r) + Softening * Softening;
    float invDist = rsqrt(distSq);
    float invDistCube = invDist * invDist * invDist;

    float3 acc = G * CentralMass * invDistCube * r;

    // Leapfrog integration
    NewVelocity = MyVelocity + 0.5 * DeltaTime * acc;
    NewPosition = MyPosition + DeltaTime * NewVelocity;
    NewVelocity = NewVelocity + 0.5 * DeltaTime * acc;
}
```

---

## Option B: Pre-baked REBOUND Data

### Step 1: Generate Simulation Data

Using the Python desktop app:

```bash
# Install dependencies
pip install rebound moderngl moderngl-window numpy

# Run the desktop viewer
python apps/desktop_gl/main.py

# Press 'E' to export, or run directly:
python -c "
from core.physics import REBOUNDSimulation, GalaxyConfig
from core.export import UE5Exporter

# Configure galaxy
config = GalaxyConfig(
    num_particles=50000,
    central_mass=1e6,
    disk_radius=15.0
)

# Run simulation
sim = REBOUNDSimulation(config)
sim.initialize_galaxy()

# Export for UE5
exporter = UE5Exporter(sim)
exporter.simulate_and_record(duration=30.0, fps=30)
exporter.export_niagara_ndi('exports/galaxy_ndi')
"
```

### Step 2: Import into UE5

1. Copy the exported `exports/galaxy_ndi/` folder to your UE5 project
2. Create a **Data Asset** to reference the binary files
3. Create a custom **Niagara Data Interface** (see below)

### Step 3: Create Niagara Data Interface

Create a C++ class `UNiagaraDataInterfaceGalaxyCache`:

```cpp
// NiagaraDataInterfaceGalaxyCache.h
#pragma once

#include "NiagaraDataInterface.h"
#include "NiagaraDataInterfaceGalaxyCache.generated.h"

UCLASS(EditInlineNew, Category = "Galaxy", meta = (DisplayName = "Galaxy Simulation Cache"))
class UNiagaraDataInterfaceGalaxyCache : public UNiagaraDataInterface
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, Category = "Galaxy Cache")
    FString CacheDirectory;

    UPROPERTY(EditAnywhere, Category = "Galaxy Cache")
    int32 NumParticles;

    UPROPERTY(EditAnywhere, Category = "Galaxy Cache")
    int32 NumFrames;

    UPROPERTY(EditAnywhere, Category = "Galaxy Cache")
    float FPS;

    // ... Implementation for reading binary data and exposing to Niagara
};
```

### Step 4: Use in Niagara

1. Add the Data Interface to your Niagara System
2. In Particle Update, sample position from cache based on time:

```hlsl
void SampleGalaxyCache(
    in int ParticleIndex,
    in float Time,
    in float FPS,
    in int NumFrames,
    out float3 Position,
    out float3 Velocity
)
{
    float frame = Time * FPS;
    int frame0 = int(frame) % NumFrames;
    int frame1 = (frame0 + 1) % NumFrames;
    float t = frac(frame);

    // Interpolate between frames
    float3 pos0 = ReadPositionFromCache(ParticleIndex, frame0);
    float3 pos1 = ReadPositionFromCache(ParticleIndex, frame1);

    Position = lerp(pos0, pos1, t);
    Velocity = (pos1 - pos0) * FPS;
}
```

---

## Material Setup

Create material `M_GalaxyParticle`:

### Material Properties:
- **Blend Mode**: Additive
- **Shading Model**: Unlit
- **Two Sided**: Yes

### Material Graph:

```
[Particle Color] ──────┬──► [Emissive Color]
                       │
[Radial Gradient] ─────┼──► [Opacity]
                       │
[Particle Size] ───────┴──► [World Position Offset] (for size)
```

### Custom Radial Gradient Node:

```hlsl
// Create soft circular particle
float2 UV = GetParticleSubUV();
float2 centered = UV - 0.5;
float dist = length(centered) * 2.0;
float alpha = 1.0 - smoothstep(0.0, 1.0, dist);
return pow(alpha, 1.5);
```

---

## Performance Optimization

### Particle Count Guidelines:

| Platform | Recommended Max | Notes |
|----------|----------------|-------|
| High-end PC | 100,000 | Full N-body possible up to ~20K |
| Mid-range PC | 30,000 | Use central-mass mode |
| Console (PS5/XSX) | 50,000 | Central-mass mode |
| Mobile/VR | 5,000-10,000 | Pre-baked only |

### Optimization Tips:

1. **Use LOD Systems**: Reduce particle count at distance
2. **Spatial Partitioning**: For large simulations, only compute nearby interactions
3. **Frame Skipping**: Update physics every 2-3 frames
4. **Async Compute**: Enable async compute for better GPU utilization
5. **Fixed Bounds**: Always use fixed bounds in Niagara

### GPU Memory Usage:

```
Memory per particle ≈ 48 bytes (position, velocity, color, mass)
10,000 particles ≈ 0.5 MB
100,000 particles ≈ 5 MB
1,000,000 particles ≈ 50 MB
```

---

## Troubleshooting

### Common Issues:

**Particles not moving:**
- Check that Simulation Stage is enabled
- Verify DeltaTime is being passed correctly
- Ensure particle attributes are being written back

**Particles flying apart:**
- Reduce timestep (TimeScale parameter)
- Increase softening parameter
- Check gravitational constant units

**Poor performance:**
- Switch to central-mass-only mode
- Reduce particle count
- Enable GPU Compute Sim target
- Check for unnecessary particle attribute reads

**Particles clumping at center:**
- Increase initial velocity
- Check circular velocity calculation
- Verify radius distribution

### Debug Visualization:

Add these modules to visualize simulation state:

```hlsl
// Debug: Color by velocity magnitude
float speed = length(Velocity);
DebugColor = float4(speed / MaxSpeed, 0, 1 - speed / MaxSpeed, 1);

// Debug: Color by acceleration
float accMag = length(Acceleration);
DebugColor = float4(accMag / MaxAcc, accMag / MaxAcc, 0, 1);
```

---

## File Reference

```
SoupyNBody/
├── shaders/hlsl/
│   ├── nbody_compute.hlsl      # Main compute shader
│   └── particle_render.hlsl    # Material functions
├── exports/
│   └── galaxy_ndi/             # Exported simulation data
│       ├── metadata.json
│       ├── positions.bin
│       ├── velocities.bin
│       └── masses.bin
└── docs/
    └── ue5_setup.md            # This file
```

---

## Support

For issues or questions:
- Check the main README.md
- Review the HLSL shader comments
- Examine the Python reference implementation

The Python desktop viewer (`apps/desktop_gl/main.py`) serves as the reference implementation for the physics simulation.
