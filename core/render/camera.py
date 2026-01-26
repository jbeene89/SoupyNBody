"""Camera utilities for 3D rendering."""

import numpy as np
from typing import Tuple


class Camera:
    """Orbital camera for viewing the simulation."""

    def __init__(self, distance: float = 30.0, fov: float = 60.0,
                 aspect: float = 16/9, near: float = 0.1, far: float = 1000.0):
        """Initialize the camera.

        Args:
            distance: Distance from the origin
            fov: Field of view in degrees
            aspect: Aspect ratio (width/height)
            near: Near clipping plane
            far: Far clipping plane
        """
        self.distance = distance
        self.fov = fov
        self.aspect = aspect
        self.near = near
        self.far = far

        # Orbital angles (in radians)
        self.azimuth = 0.0  # Horizontal rotation
        self.elevation = 0.3  # Vertical rotation (0 = side view, pi/2 = top view)

        # Target point (what the camera looks at)
        self.target = np.array([0.0, 0.0, 0.0], dtype=np.float32)

        # Auto-rotation speed (radians per second)
        self.auto_rotate_speed = 0.1

    @property
    def position(self) -> np.ndarray:
        """Calculate camera position from orbital parameters."""
        x = self.distance * np.cos(self.elevation) * np.sin(self.azimuth)
        y = self.distance * np.sin(self.elevation)
        z = self.distance * np.cos(self.elevation) * np.cos(self.azimuth)
        return np.array([x, y, z], dtype=np.float32) + self.target

    def get_view_matrix(self) -> np.ndarray:
        """Calculate the view matrix (camera transformation)."""
        pos = self.position
        target = self.target

        # Forward vector (from camera to target)
        forward = target - pos
        forward = forward / np.linalg.norm(forward)

        # Up vector (world up)
        world_up = np.array([0.0, 1.0, 0.0], dtype=np.float32)

        # Right vector
        right = np.cross(forward, world_up)
        if np.linalg.norm(right) < 0.001:
            # Camera looking straight up/down, use different up vector
            world_up = np.array([0.0, 0.0, 1.0], dtype=np.float32)
            right = np.cross(forward, world_up)
        right = right / np.linalg.norm(right)

        # Recalculate up vector
        up = np.cross(right, forward)

        # Build view matrix
        view = np.eye(4, dtype=np.float32)
        view[0, :3] = right
        view[1, :3] = up
        view[2, :3] = -forward
        view[0, 3] = -np.dot(right, pos)
        view[1, 3] = -np.dot(up, pos)
        view[2, 3] = np.dot(forward, pos)

        return view

    def get_projection_matrix(self) -> np.ndarray:
        """Calculate the perspective projection matrix."""
        fov_rad = np.radians(self.fov)
        f = 1.0 / np.tan(fov_rad / 2.0)

        proj = np.zeros((4, 4), dtype=np.float32)
        proj[0, 0] = f / self.aspect
        proj[1, 1] = f
        proj[2, 2] = (self.far + self.near) / (self.near - self.far)
        proj[2, 3] = (2.0 * self.far * self.near) / (self.near - self.far)
        proj[3, 2] = -1.0

        return proj

    def get_view_projection_matrix(self) -> np.ndarray:
        """Get combined view-projection matrix."""
        return self.get_projection_matrix() @ self.get_view_matrix()

    def update(self, dt: float, auto_rotate: bool = True):
        """Update camera state.

        Args:
            dt: Time delta in seconds
            auto_rotate: Whether to auto-rotate around the target
        """
        if auto_rotate:
            self.azimuth += self.auto_rotate_speed * dt

    def orbit(self, delta_azimuth: float, delta_elevation: float):
        """Orbit the camera around the target.

        Args:
            delta_azimuth: Change in horizontal angle (radians)
            delta_elevation: Change in vertical angle (radians)
        """
        self.azimuth += delta_azimuth
        self.elevation += delta_elevation

        # Clamp elevation to avoid flipping
        self.elevation = np.clip(self.elevation, -np.pi/2 + 0.1, np.pi/2 - 0.1)

    def zoom(self, delta: float):
        """Zoom the camera in or out.

        Args:
            delta: Positive to zoom in, negative to zoom out
        """
        self.distance *= (1.0 - delta * 0.1)
        self.distance = np.clip(self.distance, 1.0, 500.0)

    def set_aspect(self, width: int, height: int):
        """Update aspect ratio from window dimensions."""
        if height > 0:
            self.aspect = width / height
