#!/usr/bin/env python3
"""Desktop OpenGL N-body galaxy simulator using REBOUND physics and ModernGL rendering.

This application uses:
- REBOUND: Professional astrophysical N-body library for accurate physics
- ModernGL: Modern OpenGL bindings for Python for GPU-accelerated rendering

REBOUND provides multiple high-accuracy integrators:
- IAS15: 15th order adaptive integrator (default, most accurate)
- WHFast: Fast symplectic integrator for planetary systems
- MERCURIUS: Hybrid integrator for close encounters
"""

import sys
import os
from pathlib import Path

# Add project root to path for imports
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import moderngl
import moderngl_window as mglw

from core.physics import REBOUNDSimulation, GalaxyConfig, Integrator, REBOUND_AVAILABLE
from core.render import Camera, ColorMap
from core.shared import Config


def load_shader(filename: str) -> str:
    """Load shader source from file."""
    shader_path = PROJECT_ROOT / "shaders" / "glsl" / filename
    with open(shader_path, 'r') as f:
        return f.read()


class NBodyWindow(mglw.WindowConfig):
    """Main application window for the REBOUND-powered N-body simulation."""

    title = "SoupyNBody - Galaxy Simulator (REBOUND Physics)"
    gl_version = (3, 3)  # Reduced requirement since we don't need compute shaders
    window_size = (1280, 720)
    aspect_ratio = None
    resizable = True
    samples = 4  # Anti-aliasing

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # Check REBOUND availability
        if not REBOUND_AVAILABLE:
            print("ERROR: REBOUND library not installed.")
            print("Install with: pip install rebound")
            sys.exit(1)

        # Load configuration
        self.config = Config.from_env()

        # Get integrator from environment
        integrator_name = os.environ.get('INTEGRATOR', 'ias15').upper()
        try:
            integrator = Integrator[integrator_name]
        except KeyError:
            print(f"Unknown integrator '{integrator_name}', using IAS15")
            integrator = Integrator.IAS15

        # Galaxy configuration
        galaxy_config = GalaxyConfig(
            num_particles=self.config.num_particles,
            central_mass=1e6,
            disk_mass=1e4,
            disk_radius=self.config.galaxy_radius,
            disk_scale_height=self.config.galaxy_thickness,
            bulge_fraction=0.1,
        )

        print(f"Initializing SoupyNBody with REBOUND physics")
        print(f"  Particles: {galaxy_config.num_particles}")
        print(f"  Integrator: {integrator.value}")
        print(f"  Central mass: {galaxy_config.central_mass:.2e}")

        # Initialize simulation with REBOUND
        self.simulation = REBOUNDSimulation(
            config=galaxy_config,
            integrator=integrator
        )
        self.simulation.initialize_galaxy(seed=42)

        # Store galaxy radius for rendering
        self.galaxy_radius = galaxy_config.disk_radius

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
        self.show_info = True
        self.frame_count = 0
        self.total_time = 0.0

        print("\nControls:")
        print("  Space     - Pause/Resume simulation")
        print("  R         - Toggle auto-rotation")
        print("  I         - Toggle info display")
        print("  E         - Export current state for UE5")
        print("  C         - Initialize galaxy collision")
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
            max_radius=self.galaxy_radius
        )

        # Create vertex buffer with positions and colors
        num_particles = self.simulation.num_particles
        vertex_data = np.zeros((num_particles, 6), dtype=np.float32)
        vertex_data[:, :3] = self.simulation.positions
        vertex_data[:, 3:] = colors

        self.vbo = self.ctx.buffer(vertex_data.tobytes())
        self.vao = self.ctx.vertex_array(
            self.program,
            [(self.vbo, '3f 3f', 'in_position', 'in_color')],
        )

        # Set uniforms
        self.program['point_size'].value = self.config.point_size
        self.program['max_radius'].value = self.galaxy_radius

        # Enable point sprites and blending
        self.ctx.enable(moderngl.PROGRAM_POINT_SIZE)
        self.ctx.enable(moderngl.BLEND)
        self.ctx.blend_func = (moderngl.SRC_ALPHA, moderngl.ONE)  # Additive blending

    def _update_vertex_buffer(self):
        """Update vertex buffer with new particle positions."""
        colors = self.colormap.colors_from_radii(
            self.simulation.positions,
            max_radius=self.galaxy_radius
        )

        num_particles = self.simulation.num_particles
        vertex_data = np.zeros((num_particles, 6), dtype=np.float32)
        vertex_data[:, :3] = self.simulation.positions
        vertex_data[:, 3:] = colors

        self.vbo.write(vertex_data.tobytes())

    def render(self, time: float, frame_time: float):
        """Render a frame."""
        # Clear screen
        self.ctx.clear(*self.config.background_color)

        # Update simulation
        if not self.paused and frame_time > 0:
            # Use adaptive timestep based on frame time
            # But clamp to reasonable range for stability
            dt = min(frame_time * 0.5, 0.05)
            self.simulation.step(dt)
            self._update_vertex_buffer()
            self.total_time = self.simulation.time

        # Update camera
        self.camera.update(frame_time, auto_rotate=self.auto_rotate and not self.paused)

        # Update uniforms
        vp_matrix = self.camera.get_view_projection_matrix()
        self.program['view_projection'].write(vp_matrix.tobytes())

        # Draw particles
        self.vao.render(moderngl.POINTS)

        self.frame_count += 1

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

            elif key == self.wnd.keys.I:
                self.show_info = not self.show_info

            elif key == self.wnd.keys.E:
                self._export_for_ue5()

            elif key == self.wnd.keys.C:
                self._initialize_collision()

            elif key == self.wnd.keys.ESCAPE:
                self.wnd.close()

    def _export_for_ue5(self):
        """Export simulation data for UE5 Niagara."""
        try:
            from core.export import UE5Exporter, ExportFormat

            print("\nExporting simulation for UE5...")
            exporter = UE5Exporter(self.simulation)

            # Record 10 seconds of simulation at 30 FPS
            def progress(frame, total):
                if frame % 50 == 0:
                    print(f"  Recording: {frame}/{total} frames")

            exporter.simulate_and_record(duration=10.0, fps=30, progress_callback=progress)

            # Export to binary format
            output_path = PROJECT_ROOT / "exports" / "galaxy_simulation.bin"
            output_path.parent.mkdir(exist_ok=True)
            exporter.export_binary(str(output_path))

            # Also export Niagara NDI format
            ndi_path = PROJECT_ROOT / "exports" / "niagara_ndi"
            exporter.export_niagara_ndi(str(ndi_path))

            print(f"\nExport complete! Files saved to: {PROJECT_ROOT / 'exports'}")

        except Exception as e:
            print(f"Export failed: {e}")

    def _initialize_collision(self):
        """Reinitialize with two colliding galaxies."""
        print("\nInitializing galaxy collision...")

        galaxy1 = GalaxyConfig(num_particles=2500, central_mass=5e5)
        galaxy2 = GalaxyConfig(num_particles=2500, central_mass=5e5)

        self.simulation.initialize_collision(
            galaxy1_config=galaxy1,
            galaxy2_config=galaxy2,
            separation=40.0,
            relative_velocity=0.3,
            impact_parameter=10.0
        )

        # Update galaxy radius for color mapping
        self.galaxy_radius = 30.0
        self.program['max_radius'].value = self.galaxy_radius

        # Reallocate buffers if particle count changed
        num_particles = self.simulation.num_particles
        vertex_data = np.zeros((num_particles, 6), dtype=np.float32)
        self.vbo = self.ctx.buffer(vertex_data.tobytes())
        self.vao = self.ctx.vertex_array(
            self.program,
            [(self.vbo, '3f 3f', 'in_position', 'in_color')],
        )

        self._update_vertex_buffer()
        print(f"Collision initialized with {num_particles} total particles")

    def mouse_press_event(self, x: int, y: int, button: int):
        """Handle mouse press."""
        if button == 1:  # Left button
            self.mouse_dragging = True

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
    print("=" * 60)
    print("SoupyNBody - N-Body Galaxy Simulator")
    print("Powered by REBOUND (astrophysical N-body library)")
    print("=" * 60)
    print()

    mglw.run_window_config(NBodyWindow)


if __name__ == '__main__':
    main()
