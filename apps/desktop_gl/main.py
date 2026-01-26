#!/usr/bin/env python3
"""Desktop OpenGL N-body galaxy simulator using ModernGL."""

import sys
import os
from pathlib import Path

# Add project root to path for imports
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import moderngl
import moderngl_window as mglw
from moderngl_window import geometry

from core.physics import NBodySimulation
from core.render import Camera, ColorMap
from core.shared import Config


def load_shader(filename: str) -> str:
    """Load shader source from file."""
    shader_path = PROJECT_ROOT / "shaders" / "glsl" / filename
    with open(shader_path, 'r') as f:
        return f.read()


class NBodyWindow(mglw.WindowConfig):
    """Main application window for the N-body simulation."""

    title = "SoupyNBody - Galaxy Simulator"
    gl_version = (4, 3)
    window_size = (1280, 720)
    aspect_ratio = None
    resizable = True
    samples = 4  # Anti-aliasing

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # Load configuration
        self.config = Config.from_env()
        self.use_gpu = self.config.physics_mode.lower() == 'gpu'

        print(f"Initializing SoupyNBody with {self.config.num_particles} particles")
        print(f"Physics mode: {'GPU compute shaders' if self.use_gpu else 'CPU fallback'}")

        # Initialize simulation
        self.simulation = NBodySimulation(
            num_particles=self.config.num_particles,
            G=self.config.gravitational_constant,
            softening=self.config.softening,
            timestep=self.config.timestep
        )
        self.simulation.initialize_galaxy(
            radius=self.config.galaxy_radius,
            thickness=self.config.galaxy_thickness,
            central_mass=self.config.central_mass
        )

        # Try to set up GPU compute if requested
        if self.use_gpu:
            try:
                compute_source = load_shader("nbody_compute.glsl")
                self.simulation.setup_gpu(self.ctx, compute_source)
                if not self.simulation.is_gpu_ready:
                    print("GPU compute not available, using CPU mode")
                    self.use_gpu = False
            except Exception as e:
                print(f"Could not initialize GPU compute: {e}")
                print("Falling back to CPU mode")
                self.use_gpu = False

        # Initialize camera
        self.camera = Camera(
            distance=self.config.camera_distance,
            fov=self.config.camera_fov,
            aspect=self.wnd.width / self.wnd.height
        )
        self.camera.elevation = 0.5  # Start with a slight top-down view

        # Initialize color map
        self.colormap = ColorMap('galaxy')

        # Create rendering resources
        self._setup_rendering()

        # Interaction state
        self.paused = False
        self.auto_rotate = True
        self.mouse_dragging = False
        self.last_mouse_pos = (0, 0)

        print("\nControls:")
        print("  Space     - Pause/Resume simulation")
        print("  R         - Toggle auto-rotation")
        print("  Mouse     - Drag to orbit camera")
        print("  Scroll    - Zoom in/out")
        print("  Escape    - Exit")

    def _setup_rendering(self):
        """Set up OpenGL rendering resources."""
        # Load shaders
        vertex_source = load_shader("particle_vertex.glsl")
        fragment_source = load_shader("particle_fragment.glsl")

        # Create shader program
        self.program = self.ctx.program(
            vertex_shader=vertex_source,
            fragment_shader=fragment_source,
        )

        # Generate initial colors based on particle positions
        colors = self.colormap.colors_from_radii(
            self.simulation.positions,
            max_radius=self.config.galaxy_radius
        )

        # Create vertex buffer with positions and colors
        # Interleave position (3 floats) and color (3 floats)
        vertex_data = np.zeros((self.config.num_particles, 6), dtype=np.float32)
        vertex_data[:, :3] = self.simulation.positions
        vertex_data[:, 3:] = colors

        self.vbo = self.ctx.buffer(vertex_data.tobytes())
        self.vao = self.ctx.vertex_array(
            self.program,
            [(self.vbo, '3f 3f', 'in_position', 'in_color')],
        )

        # Set uniforms
        self.program['point_size'].value = self.config.point_size
        self.program['max_radius'].value = self.config.galaxy_radius

        # Enable point sprites and blending
        self.ctx.enable(moderngl.PROGRAM_POINT_SIZE)
        self.ctx.enable(moderngl.BLEND)
        self.ctx.blend_func = (moderngl.SRC_ALPHA, moderngl.ONE)  # Additive blending

    def _update_vertex_buffer(self):
        """Update vertex buffer with new particle positions."""
        colors = self.colormap.colors_from_radii(
            self.simulation.positions,
            max_radius=self.config.galaxy_radius
        )

        vertex_data = np.zeros((self.config.num_particles, 6), dtype=np.float32)
        vertex_data[:, :3] = self.simulation.positions
        vertex_data[:, 3:] = colors

        self.vbo.write(vertex_data.tobytes())

    def render(self, time: float, frame_time: float):
        """Render a frame."""
        # Clear screen
        self.ctx.clear(*self.config.background_color)

        # Update simulation (multiple steps per frame for smoother animation)
        if not self.paused:
            steps_per_frame = 2
            for _ in range(steps_per_frame):
                self.simulation.step(use_gpu=self.use_gpu)
            self._update_vertex_buffer()

        # Update camera
        self.camera.update(frame_time, auto_rotate=self.auto_rotate and not self.paused)

        # Update uniforms
        vp_matrix = self.camera.get_view_projection_matrix()
        self.program['view_projection'].write(vp_matrix.tobytes())

        # Draw particles
        self.vao.render(moderngl.POINTS)

    def resize(self, width: int, height: int):
        """Handle window resize."""
        self.camera.set_aspect(width, height)

    def key_event(self, key, action, modifiers):
        """Handle keyboard input."""
        if action == self.wnd.keys.ACTION_PRESS:
            if key == self.wnd.keys.SPACE:
                self.paused = not self.paused
                print(f"Simulation {'paused' if self.paused else 'resumed'}")
            elif key == self.wnd.keys.R:
                self.auto_rotate = not self.auto_rotate
                print(f"Auto-rotation {'enabled' if self.auto_rotate else 'disabled'}")
            elif key == self.wnd.keys.ESCAPE:
                self.wnd.close()

    def mouse_press_event(self, x: int, y: int, button: int):
        """Handle mouse press."""
        if button == 1:  # Left button
            self.mouse_dragging = True
            self.last_mouse_pos = (x, y)

    def mouse_release_event(self, x: int, y: int, button: int):
        """Handle mouse release."""
        if button == 1:
            self.mouse_dragging = False

    def mouse_drag_event(self, x: int, y: int, dx: int, dy: int):
        """Handle mouse drag for camera orbit."""
        if self.mouse_dragging:
            sensitivity = 0.005
            self.camera.orbit(-dx * sensitivity, -dy * sensitivity)

    def mouse_scroll_event(self, x_offset: float, y_offset: float):
        """Handle mouse scroll for zoom."""
        self.camera.zoom(y_offset)


def main():
    """Entry point for the desktop GL application."""
    mglw.run_window_config(NBodyWindow)


if __name__ == '__main__':
    main()
