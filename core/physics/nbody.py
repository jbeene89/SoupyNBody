"""N-body simulation using REBOUND astrophysical library.

REBOUND is a professional N-body library used in astrophysics research.
It provides multiple high-accuracy integrators and proper gravitational dynamics.
"""

import numpy as np
from typing import Optional, Tuple, List
from dataclasses import dataclass
from enum import Enum

try:
    import rebound
    REBOUND_AVAILABLE = True
except ImportError:
    REBOUND_AVAILABLE = False
    print("Warning: REBOUND not installed. Install with: pip install rebound")


class Integrator(Enum):
    """Available REBOUND integrators."""
    IAS15 = "ias15"          # High accuracy, adaptive timestep (default)
    WHFAST = "whfast"        # Fast symplectic, good for planetary systems
    LEAPFROG = "leapfrog"    # Simple symplectic
    SEI = "sei"              # Symplectic epicycle integrator
    MERCURIUS = "mercurius"  # Hybrid symplectic + IAS15 for close encounters


@dataclass
class GalaxyConfig:
    """Configuration for galaxy initialization."""
    num_particles: int = 5000
    central_mass: float = 1e6        # Solar masses
    disk_mass: float = 1e4           # Total disk mass in solar masses
    disk_radius: float = 15.0        # kpc
    disk_scale_height: float = 0.3   # kpc
    bulge_fraction: float = 0.1      # Fraction of particles in bulge
    halo_fraction: float = 0.0       # Fraction in dark matter halo (simplified)


class REBOUNDSimulation:
    """N-body simulation powered by REBOUND.

    Uses REBOUND's high-accuracy integrators for proper gravitational dynamics.
    Supports various galaxy configurations and integrator choices.
    """

    def __init__(self, config: Optional[GalaxyConfig] = None,
                 integrator: Integrator = Integrator.IAS15):
        """Initialize the REBOUND-based simulation.

        Args:
            config: Galaxy configuration parameters
            integrator: Which REBOUND integrator to use
        """
        if not REBOUND_AVAILABLE:
            raise ImportError("REBOUND is required. Install with: pip install rebound")

        self.config = config or GalaxyConfig()
        self._integrator_type = integrator

        # Create REBOUND simulation
        self.sim = rebound.Simulation()
        self.sim.integrator = integrator.value

        # Set units (use G=1 normalized units for simplicity)
        self.sim.G = 1.0

        # Configure integrator-specific settings
        self._configure_integrator()

        # Cached numpy arrays for rendering (updated after each step)
        self._positions: Optional[np.ndarray] = None
        self._velocities: Optional[np.ndarray] = None
        self._masses: Optional[np.ndarray] = None

        # Simulation state
        self.time = 0.0
        self.timestep = 0.01

    def _configure_integrator(self):
        """Configure integrator-specific settings."""
        if self._integrator_type == Integrator.IAS15:
            # IAS15 is adaptive, no fixed timestep needed
            pass
        elif self._integrator_type == Integrator.WHFAST:
            # WHFast needs a fixed timestep, set based on fastest orbit
            self.sim.dt = 0.01
        elif self._integrator_type == Integrator.MERCURIUS:
            # Mercurius: hybrid integrator
            self.sim.ri_mercurius.hillfac = 3.0

    def initialize_galaxy(self, seed: Optional[int] = None):
        """Initialize particles in a realistic galaxy configuration.

        Creates a disk galaxy with:
        - Central supermassive black hole / bulge
        - Exponential disk with proper rotation curve
        - Optional bulge and halo components

        Args:
            seed: Random seed for reproducibility
        """
        if seed is not None:
            np.random.seed(seed)

        cfg = self.config
        n = cfg.num_particles

        # Clear existing particles
        while self.sim.N > 0:
            self.sim.remove(0)

        # 1. Add central mass (SMBH / bulge core)
        self.sim.add(m=cfg.central_mass, x=0, y=0, z=0, vx=0, vy=0, vz=0)

        # 2. Calculate particle distribution
        n_bulge = int(n * cfg.bulge_fraction)
        n_disk = n - n_bulge - 1  # -1 for central mass

        # Individual particle mass
        particle_mass = cfg.disk_mass / (n_disk + n_bulge)

        # 3. Add disk particles with exponential radial profile
        for i in range(n_disk):
            # Exponential disk profile: P(r) ∝ r * exp(-r/R_d)
            # Use inverse CDF sampling
            u = np.random.random()
            # Approximate inverse CDF for exponential disk
            r = -cfg.disk_radius * 0.3 * np.log(1 - u * (1 - np.exp(-cfg.disk_radius / (cfg.disk_radius * 0.3))))
            r = np.clip(r, 0.1, cfg.disk_radius)

            theta = 2.0 * np.pi * np.random.random()

            # Positions
            x = r * np.cos(theta)
            y = r * np.sin(theta)
            z = cfg.disk_scale_height * np.random.standard_normal() * np.exp(-r / cfg.disk_radius)

            # Circular velocity from enclosed mass (simplified: central mass dominates)
            # v_circ = sqrt(G * M_enclosed / r)
            M_enclosed = cfg.central_mass + particle_mass * i * (r / cfg.disk_radius)
            v_circ = np.sqrt(self.sim.G * M_enclosed / r)

            # Add velocity dispersion (Toomre Q parameter consideration)
            sigma_r = 0.1 * v_circ  # Radial velocity dispersion
            sigma_z = 0.05 * v_circ  # Vertical velocity dispersion

            # Tangential velocity (circular + dispersion)
            vx = -v_circ * np.sin(theta) + sigma_r * np.random.standard_normal() * np.cos(theta)
            vy = v_circ * np.cos(theta) + sigma_r * np.random.standard_normal() * np.sin(theta)
            vz = sigma_z * np.random.standard_normal()

            self.sim.add(m=particle_mass, x=x, y=y, z=z, vx=vx, vy=vy, vz=vz)

        # 4. Add bulge particles (spherical distribution)
        bulge_radius = cfg.disk_radius * 0.2
        for i in range(n_bulge):
            # Hernquist profile for bulge
            u = np.random.random()
            r = bulge_radius * np.sqrt(u) / (1 - np.sqrt(u) + 0.01)
            r = np.clip(r, 0.1, bulge_radius * 3)

            # Spherical angles
            theta = 2.0 * np.pi * np.random.random()
            phi = np.arccos(2.0 * np.random.random() - 1.0)

            x = r * np.sin(phi) * np.cos(theta)
            y = r * np.sin(phi) * np.sin(theta)
            z = r * np.cos(phi)

            # Velocity dispersion (isotropic)
            sigma = np.sqrt(self.sim.G * cfg.central_mass / (r + bulge_radius)) * 0.5
            vx = sigma * np.random.standard_normal()
            vy = sigma * np.random.standard_normal()
            vz = sigma * np.random.standard_normal()

            self.sim.add(m=particle_mass, x=x, y=y, z=z, vx=vx, vy=vy, vz=vz)

        # 5. Move to center of mass frame
        self.sim.move_to_com()

        # Update cached arrays
        self._update_arrays()

        print(f"Initialized galaxy with {self.sim.N} particles")
        print(f"  Central mass: {cfg.central_mass:.2e}")
        print(f"  Disk particles: {n_disk}")
        print(f"  Bulge particles: {n_bulge}")
        print(f"  Integrator: {self._integrator_type.value}")

    def initialize_collision(self, galaxy1_config: Optional[GalaxyConfig] = None,
                            galaxy2_config: Optional[GalaxyConfig] = None,
                            separation: float = 30.0,
                            relative_velocity: float = 0.5,
                            impact_parameter: float = 5.0):
        """Initialize two galaxies on collision course.

        Args:
            galaxy1_config: Config for first galaxy
            galaxy2_config: Config for second galaxy (defaults to galaxy1)
            separation: Initial separation between galaxy centers
            relative_velocity: Approach velocity
            impact_parameter: Perpendicular offset (0 = head-on)
        """
        cfg1 = galaxy1_config or GalaxyConfig(num_particles=2500)
        cfg2 = galaxy2_config or GalaxyConfig(num_particles=2500)

        # Create first galaxy at origin
        self.config = cfg1
        self.initialize_galaxy(seed=42)

        # Store first galaxy particles
        particles1 = [(p.m, p.x, p.y, p.z, p.vx, p.vy, p.vz)
                      for p in self.sim.particles]

        # Clear and create second galaxy
        while self.sim.N > 0:
            self.sim.remove(0)

        self.config = cfg2
        self.initialize_galaxy(seed=123)

        # Offset second galaxy
        for p in self.sim.particles:
            p.x += separation
            p.y += impact_parameter
            p.vx -= relative_velocity

        particles2 = [(p.m, p.x, p.y, p.z, p.vx, p.vy, p.vz)
                      for p in self.sim.particles]

        # Clear and add all particles
        while self.sim.N > 0:
            self.sim.remove(0)

        for m, x, y, z, vx, vy, vz in particles1 + particles2:
            self.sim.add(m=m, x=x, y=y, z=z, vx=vx, vy=vy, vz=vz)

        self.sim.move_to_com()
        self._update_arrays()

        print(f"Initialized galaxy collision with {self.sim.N} total particles")

    def _update_arrays(self):
        """Update cached numpy arrays from REBOUND particles."""
        n = self.sim.N
        self._positions = np.zeros((n, 3), dtype=np.float32)
        self._velocities = np.zeros((n, 3), dtype=np.float32)
        self._masses = np.zeros(n, dtype=np.float32)

        for i, p in enumerate(self.sim.particles):
            self._positions[i] = [p.x, p.y, p.z]
            self._velocities[i] = [p.vx, p.vy, p.vz]
            self._masses[i] = p.m

    def step(self, dt: Optional[float] = None):
        """Advance simulation by one timestep.

        Args:
            dt: Timestep (uses default if not specified)
        """
        dt = dt or self.timestep
        self.sim.integrate(self.sim.t + dt)
        self.time = self.sim.t
        self._update_arrays()

    def step_to(self, target_time: float):
        """Integrate to a specific time.

        Args:
            target_time: Target simulation time
        """
        self.sim.integrate(target_time)
        self.time = self.sim.t
        self._update_arrays()

    @property
    def positions(self) -> np.ndarray:
        """Get particle positions as numpy array (N, 3)."""
        if self._positions is None:
            self._update_arrays()
        return self._positions

    @property
    def velocities(self) -> np.ndarray:
        """Get particle velocities as numpy array (N, 3)."""
        if self._velocities is None:
            self._update_arrays()
        return self._velocities

    @property
    def masses(self) -> np.ndarray:
        """Get particle masses as numpy array (N,)."""
        if self._masses is None:
            self._update_arrays()
        return self._masses

    @property
    def num_particles(self) -> int:
        """Get number of particles."""
        return self.sim.N

    def get_energy(self) -> Tuple[float, float, float]:
        """Get system energy.

        Returns:
            Tuple of (kinetic_energy, potential_energy, total_energy)
        """
        ke = self.sim.calculate_energy() - self.sim.calculate_energy()  # Placeholder
        pe = 0.0

        # Calculate energies manually for accuracy
        for i, p in enumerate(self.sim.particles):
            ke += 0.5 * p.m * (p.vx**2 + p.vy**2 + p.vz**2)
            for j in range(i + 1, self.sim.N):
                q = self.sim.particles[j]
                dx = p.x - q.x
                dy = p.y - q.y
                dz = p.z - q.z
                r = np.sqrt(dx**2 + dy**2 + dz**2)
                if r > 0:
                    pe -= self.sim.G * p.m * q.m / r

        return ke, pe, ke + pe

    def save_snapshot(self, filename: str):
        """Save simulation state to file.

        Args:
            filename: Output filename (.bin for binary, .txt for ASCII)
        """
        self.sim.save_to_file(filename)
        print(f"Saved snapshot to {filename}")

    def load_snapshot(self, filename: str):
        """Load simulation state from file.

        Args:
            filename: Input filename
        """
        self.sim = rebound.Simulation(filename)
        self._update_arrays()
        print(f"Loaded snapshot from {filename}")

    def export_for_ue5(self, filename: str, duration: float, fps: int = 30):
        """Export simulation as frame data for UE5 Niagara.

        Exports particle positions and velocities for each frame as binary data
        that can be imported into Unreal Engine.

        Args:
            filename: Output filename (.bin)
            duration: Duration in simulation time units
            fps: Frames per second for export
        """
        num_frames = int(duration * fps)
        dt = duration / num_frames

        # Reset to initial state if needed
        initial_time = self.time

        # Prepare output arrays
        all_positions = []
        all_velocities = []

        print(f"Exporting {num_frames} frames for UE5...")

        for frame in range(num_frames):
            self._update_arrays()
            all_positions.append(self._positions.copy())
            all_velocities.append(self._velocities.copy())

            if frame < num_frames - 1:
                self.step(dt)

            if frame % 100 == 0:
                print(f"  Frame {frame}/{num_frames}")

        # Save as numpy archive
        np.savez_compressed(
            filename,
            positions=np.array(all_positions),
            velocities=np.array(all_velocities),
            masses=self._masses,
            fps=fps,
            num_particles=self.num_particles
        )

        print(f"Exported to {filename}")
        print(f"  Frames: {num_frames}")
        print(f"  Particles: {self.num_particles}")
        print(f"  File size: {np.array(all_positions).nbytes / 1e6:.1f} MB")


# Backwards compatibility alias
NBodySimulation = REBOUNDSimulation
