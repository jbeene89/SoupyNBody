"""Integration schemes for N-body simulation."""

from abc import ABC, abstractmethod
import numpy as np


class Integrator(ABC):
    """Abstract base class for numerical integrators."""

    @abstractmethod
    def step(self, positions: np.ndarray, velocities: np.ndarray,
             masses: np.ndarray, dt: float, G: float, softening: float) -> tuple:
        """Perform one integration step.

        Args:
            positions: Particle positions (N, 3)
            velocities: Particle velocities (N, 3)
            masses: Particle masses (N,)
            dt: Time step
            G: Gravitational constant
            softening: Softening parameter

        Returns:
            Tuple of (new_positions, new_velocities)
        """
        pass


class LeapfrogIntegrator(Integrator):
    """Leapfrog (Verlet) integrator - symplectic and energy-conserving."""

    def __init__(self):
        self._accelerations = None

    def compute_accelerations(self, positions: np.ndarray, masses: np.ndarray,
                              G: float, softening: float) -> np.ndarray:
        """Compute gravitational accelerations for all particles.

        Args:
            positions: Particle positions (N, 3)
            masses: Particle masses (N,)
            G: Gravitational constant
            softening: Softening parameter to prevent singularities

        Returns:
            Accelerations array (N, 3)
        """
        n = len(positions)
        accelerations = np.zeros_like(positions)

        for i in range(n):
            # Vector from particle i to all other particles
            r = positions - positions[i]  # (N, 3)

            # Squared distances with softening
            dist_sq = np.sum(r * r, axis=1) + softening * softening  # (N,)

            # Avoid self-interaction by setting dist_sq[i] to infinity
            dist_sq[i] = np.inf

            # Inverse cube of distance
            inv_dist_cube = dist_sq ** (-1.5)  # (N,)

            # Acceleration contribution from each particle
            acc = G * masses * inv_dist_cube  # (N,)
            accelerations[i] = np.sum(r * acc[:, np.newaxis], axis=0)

        return accelerations

    def step(self, positions: np.ndarray, velocities: np.ndarray,
             masses: np.ndarray, dt: float, G: float, softening: float) -> tuple:
        """Perform one leapfrog integration step.

        Uses the kick-drift-kick form of the leapfrog integrator.
        """
        # Compute initial accelerations if not cached
        if self._accelerations is None:
            self._accelerations = self.compute_accelerations(positions, masses, G, softening)

        # Kick: half-step velocity update
        velocities = velocities + 0.5 * dt * self._accelerations

        # Drift: full-step position update
        positions = positions + dt * velocities

        # Compute new accelerations
        self._accelerations = self.compute_accelerations(positions, masses, G, softening)

        # Kick: half-step velocity update
        velocities = velocities + 0.5 * dt * self._accelerations

        return positions, velocities
