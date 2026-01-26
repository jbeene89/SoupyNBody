"""Shared configuration for the N-body simulation."""

import os
from dataclasses import dataclass, field
from typing import Tuple


@dataclass
class Config:
    """Configuration settings for the N-body simulation."""

    # Number of particles in the simulation
    num_particles: int = 10000

    # Window dimensions
    window_size: Tuple[int, int] = (1280, 720)

    # Simulation parameters
    timestep: float = 0.001
    gravitational_constant: float = 1.0
    softening: float = 0.1  # Softening parameter to prevent singularities

    # Galaxy parameters
    galaxy_radius: float = 10.0
    galaxy_thickness: float = 0.5
    central_mass: float = 1000.0

    # Rendering parameters
    point_size: float = 2.0
    background_color: Tuple[float, float, float, float] = (0.02, 0.02, 0.05, 1.0)

    # Physics mode: 'gpu' for compute shaders, 'simple' for CPU fallback
    physics_mode: str = field(default_factory=lambda: os.environ.get('PHYSICS_MODE', 'gpu'))

    # Camera settings
    camera_distance: float = 30.0
    camera_fov: float = 60.0

    @classmethod
    def from_env(cls) -> 'Config':
        """Create config from environment variables with defaults."""
        config = cls()

        if os.environ.get('NUM_PARTICLES'):
            config.num_particles = int(os.environ['NUM_PARTICLES'])
        if os.environ.get('TIMESTEP'):
            config.timestep = float(os.environ['TIMESTEP'])
        if os.environ.get('PHYSICS_MODE'):
            config.physics_mode = os.environ['PHYSICS_MODE']

        return config
