# Unreal Engine 5 Niagara Integration

This document describes how to set up the N-body simulation in Unreal Engine 5 using the Niagara particle system.

## Prerequisites

- Unreal Engine 5.0 or later
- Basic familiarity with Niagara

## Overview

The UE5 Niagara version uses HLSL compute shaders to perform the N-body simulation directly on the GPU within Unreal's rendering pipeline.

## Setup Instructions

1. **Import the Niagara System**
   - Copy the contents of `apps/ue5_niagara/` to your UE5 project's Content folder
   - The Niagara system asset will appear in the Content Browser

2. **Configure the Simulation**
   - Open the Niagara system
   - Adjust parameters in the User Exposed section:
     - `NumParticles`: Number of particles (default: 10000)
     - `GravitationalConstant`: G value for force calculations
     - `Softening`: Softening parameter to prevent singularities
     - `GalaxyRadius`: Initial distribution radius

3. **Add to Scene**
   - Drag the Niagara system into your level
   - The simulation will start automatically on play

## HLSL Shaders

The HLSL compute shaders are located in `shaders/hlsl/`. These are used by the Niagara simulation stages:

- `nbody_compute.hlsl`: Main N-body force calculation and integration
- `galaxy_init.hlsl`: Initial galaxy distribution setup

## Performance Notes

- The UE5 version is optimized for real-time rendering alongside other game content
- Consider reducing particle count for mobile or VR targets
- GPU memory usage scales linearly with particle count

## Placeholder Notice

**Note:** The UE5 Niagara integration is currently a placeholder. Full implementation is planned for a future release.
