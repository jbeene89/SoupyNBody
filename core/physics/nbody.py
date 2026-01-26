"""N-body simulation core module."""

import numpy as np
from typing import Optional, Tuple

from .integrator import LeapfrogIntegrator


class NBodySimulation:
    """N-body gravitational simulation.

    Supports both GPU compute shader mode and CPU fallback mode.
    """

    def __init__(self, num_particles: int, G: float = 1.0, softening: float = 0.1,
                 timestep: float = 0.001):
        """Initialize the N-body simulation.

        Args:
            num_particles: Number of particles in the simulation
            G: Gravitational constant
            softening: Softening parameter to prevent singularities
            timestep: Integration time step
        """
        self.num_particles = num_particles
        self.G = G
        self.softening = softening
        self.timestep = timestep

        # Particle data arrays
        self.positions: np.ndarray = np.zeros((num_particles, 3), dtype=np.float32)
        self.velocities: np.ndarray = np.zeros((num_particles, 3), dtype=np.float32)
        self.masses: np.ndarray = np.ones(num_particles, dtype=np.float32)

        # CPU integrator for fallback mode
        self._integrator = LeapfrogIntegrator()

        # GPU resources (set up later if available)
        self._gpu_initialized = False
        self._ctx = None
        self._compute_shader = None
        self._position_buffer = None
        self._velocity_buffer = None
        self._mass_buffer = None

    def initialize_galaxy(self, radius: float = 10.0, thickness: float = 0.5,
                          central_mass: float = 1000.0):
        """Initialize particles in a disk galaxy configuration.

        Args:
            radius: Radius of the galaxy disk
            thickness: Vertical thickness of the disk
            central_mass: Mass of the central black hole/bulge
        """
        n = self.num_particles

        # Generate radial positions with exponential distribution (disk profile)
        r = radius * np.sqrt(np.random.random(n))

        # Angular positions uniformly distributed
        theta = 2.0 * np.pi * np.random.random(n)

        # Convert to Cartesian coordinates
        self.positions[:, 0] = r * np.cos(theta)
        self.positions[:, 1] = r * np.sin(theta)
        self.positions[:, 2] = thickness * (np.random.random(n) - 0.5)

        # Calculate circular orbital velocity for each particle
        # v = sqrt(G * M_enclosed / r)
        # Assuming central mass dominates
        v_circular = np.sqrt(self.G * central_mass / (r + self.softening))

        # Set velocities tangent to orbit (perpendicular to radial direction)
        self.velocities[:, 0] = -v_circular * np.sin(theta)
        self.velocities[:, 1] = v_circular * np.cos(theta)
        self.velocities[:, 2] = 0.0

        # Add small random velocity dispersion
        dispersion = 0.05 * v_circular[:, np.newaxis]
        self.velocities += dispersion * np.random.randn(n, 3)

        # Set masses - smaller particles have unit mass
        self.masses[:] = 1.0

        # First particle is the central mass
        self.positions[0] = [0.0, 0.0, 0.0]
        self.velocities[0] = [0.0, 0.0, 0.0]
        self.masses[0] = central_mass

        # Convert to float32 for GPU compatibility
        self.positions = self.positions.astype(np.float32)
        self.velocities = self.velocities.astype(np.float32)
        self.masses = self.masses.astype(np.float32)

    def setup_gpu(self, ctx, compute_shader_source: str):
        """Initialize GPU compute shader resources.

        Args:
            ctx: ModernGL context
            compute_shader_source: GLSL compute shader source code
        """
        self._ctx = ctx

        try:
            self._compute_shader = ctx.compute_shader(compute_shader_source)

            # Create GPU buffers
            self._position_buffer = ctx.buffer(self.positions.tobytes())
            self._velocity_buffer = ctx.buffer(self.velocities.tobytes())
            self._mass_buffer = ctx.buffer(self.masses.tobytes())

            self._gpu_initialized = True
        except Exception as e:
            print(f"GPU compute shader initialization failed: {e}")
            print("Falling back to CPU simulation mode.")
            self._gpu_initialized = False

    def step_cpu(self):
        """Perform one simulation step on CPU."""
        self.positions, self.velocities = self._integrator.step(
            self.positions, self.velocities, self.masses,
            self.timestep, self.G, self.softening
        )

    def step_gpu(self):
        """Perform one simulation step on GPU using compute shader."""
        if not self._gpu_initialized:
            self.step_cpu()
            return

        # Update uniforms
        self._compute_shader['dt'].value = self.timestep
        self._compute_shader['G'].value = self.G
        self._compute_shader['softening'].value = self.softening
        self._compute_shader['num_particles'].value = self.num_particles

        # Bind buffers
        self._position_buffer.bind_to_storage_buffer(0)
        self._velocity_buffer.bind_to_storage_buffer(1)
        self._mass_buffer.bind_to_storage_buffer(2)

        # Run compute shader
        work_groups = (self.num_particles + 255) // 256
        self._compute_shader.run(work_groups, 1, 1)

        # Synchronize and read back positions for rendering
        self._ctx.finish()
        self.positions = np.frombuffer(
            self._position_buffer.read(), dtype=np.float32
        ).reshape(-1, 3).copy()

    def step(self, use_gpu: bool = True):
        """Perform one simulation step.

        Args:
            use_gpu: Whether to use GPU compute shaders if available
        """
        if use_gpu and self._gpu_initialized:
            self.step_gpu()
        else:
            self.step_cpu()

    def sync_to_gpu(self):
        """Upload current particle data to GPU buffers."""
        if self._gpu_initialized:
            self._position_buffer.write(self.positions.tobytes())
            self._velocity_buffer.write(self.velocities.tobytes())
            self._mass_buffer.write(self.masses.tobytes())

    def get_position_buffer(self):
        """Get the GPU position buffer for rendering."""
        return self._position_buffer

    @property
    def is_gpu_ready(self) -> bool:
        """Check if GPU compute is initialized."""
        return self._gpu_initialized
