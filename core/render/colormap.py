"""Color mapping utilities for particle visualization."""

import numpy as np
from typing import Tuple, List


class ColorMap:
    """Color mapping for particle visualization based on various properties."""

    # Predefined color schemes
    SCHEMES = {
        'plasma': [
            (0.050383, 0.029803, 0.527975),
            (0.274191, 0.051681, 0.626331),
            (0.490877, 0.090421, 0.568086),
            (0.694771, 0.165590, 0.432987),
            (0.871885, 0.306920, 0.235603),
            (0.971468, 0.502715, 0.129464),
            (0.993415, 0.722673, 0.144738),
            (0.940015, 0.975158, 0.131326),
        ],
        'inferno': [
            (0.001462, 0.000466, 0.013866),
            (0.087411, 0.044556, 0.224813),
            (0.258234, 0.038571, 0.406152),
            (0.416331, 0.090203, 0.432943),
            (0.578304, 0.148039, 0.404411),
            (0.735683, 0.215906, 0.330245),
            (0.865006, 0.316822, 0.226055),
            (0.954506, 0.468744, 0.099874),
            (0.988362, 0.652325, 0.211364),
            (0.988648, 0.809579, 0.436508),
        ],
        'galaxy': [
            (0.1, 0.1, 0.2),      # Dark blue core
            (0.3, 0.2, 0.5),      # Purple
            (0.5, 0.3, 0.6),      # Violet
            (0.7, 0.5, 0.7),      # Light purple
            (0.9, 0.7, 0.8),      # Pink
            (1.0, 0.9, 0.95),     # Near white
        ],
        'fire': [
            (0.0, 0.0, 0.0),      # Black
            (0.3, 0.0, 0.0),      # Dark red
            (0.7, 0.1, 0.0),      # Red
            (1.0, 0.4, 0.0),      # Orange
            (1.0, 0.8, 0.2),      # Yellow
            (1.0, 1.0, 0.8),      # Near white
        ],
    }

    def __init__(self, scheme: str = 'galaxy'):
        """Initialize color map with a color scheme.

        Args:
            scheme: Name of the color scheme to use
        """
        if scheme not in self.SCHEMES:
            scheme = 'galaxy'
        self.colors = np.array(self.SCHEMES[scheme], dtype=np.float32)
        self.scheme_name = scheme

    def map_value(self, value: float) -> Tuple[float, float, float]:
        """Map a normalized value [0, 1] to a color.

        Args:
            value: Normalized value between 0 and 1

        Returns:
            RGB tuple
        """
        value = np.clip(value, 0.0, 1.0)
        n = len(self.colors) - 1
        idx = value * n
        lower = int(idx)
        upper = min(lower + 1, n)
        t = idx - lower

        color = self.colors[lower] * (1 - t) + self.colors[upper] * t
        return tuple(color)

    def map_array(self, values: np.ndarray) -> np.ndarray:
        """Map an array of normalized values to colors.

        Args:
            values: Array of normalized values between 0 and 1

        Returns:
            Array of RGB colors (N, 3)
        """
        values = np.clip(values, 0.0, 1.0)
        n = len(self.colors) - 1
        idx = values * n
        lower = idx.astype(int)
        upper = np.minimum(lower + 1, n)
        t = (idx - lower)[:, np.newaxis]

        colors = self.colors[lower] * (1 - t) + self.colors[upper] * t
        return colors.astype(np.float32)

    def colors_from_radii(self, positions: np.ndarray,
                          max_radius: float = 15.0) -> np.ndarray:
        """Generate colors based on distance from origin.

        Args:
            positions: Particle positions (N, 3)
            max_radius: Maximum radius for normalization

        Returns:
            Array of RGB colors (N, 3)
        """
        radii = np.sqrt(np.sum(positions[:, :2] ** 2, axis=1))  # Use XY distance
        normalized = radii / max_radius
        return self.map_array(normalized)

    def colors_from_velocity(self, velocities: np.ndarray,
                             max_velocity: float = 5.0) -> np.ndarray:
        """Generate colors based on velocity magnitude.

        Args:
            velocities: Particle velocities (N, 3)
            max_velocity: Maximum velocity for normalization

        Returns:
            Array of RGB colors (N, 3)
        """
        speeds = np.sqrt(np.sum(velocities ** 2, axis=1))
        normalized = speeds / max_velocity
        return self.map_array(normalized)

    @classmethod
    def available_schemes(cls) -> List[str]:
        """Get list of available color schemes."""
        return list(cls.SCHEMES.keys())
