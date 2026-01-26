"""Export REBOUND simulation data for Unreal Engine 5 Niagara.

Supports multiple export formats:
- Binary (.bin): Fast, compact format for large particle counts
- CSV: Human-readable, importable via Data Tables
- Alembic (.abc): Industry-standard animation format
- Niagara Data Interface: Direct integration format
"""

import numpy as np
import struct
import json
from pathlib import Path
from enum import Enum
from typing import Optional, List, Callable
from dataclasses import dataclass


class ExportFormat(Enum):
    """Supported export formats for UE5."""
    BINARY = "bin"           # Fast binary format
    CSV = "csv"              # Data table compatible
    NIAGARA_NDI = "ndi"      # Niagara Data Interface format
    JSON = "json"            # JSON for blueprints


@dataclass
class ExportSettings:
    """Settings for simulation export."""
    fps: int = 30
    duration: float = 10.0
    scale: float = 100.0        # Scale factor (REBOUND units to UE5 cm)
    include_velocity: bool = True
    include_color: bool = True
    include_mass: bool = True
    compression: bool = True


class UE5Exporter:
    """Export REBOUND simulation data for Unreal Engine 5.

    Provides multiple export formats optimized for different UE5 workflows:
    - Binary: Best for Niagara GPU simulation with large particle counts
    - CSV: Good for Data Tables and Blueprint access
    - Niagara NDI: Direct Niagara Data Interface format
    """

    def __init__(self, simulation):
        """Initialize exporter with a REBOUND simulation.

        Args:
            simulation: REBOUNDSimulation instance
        """
        self.sim = simulation
        self._frames: List[dict] = []
        self._is_recording = False

    def record_frame(self):
        """Record current simulation state as a frame."""
        frame = {
            'time': self.sim.time,
            'positions': self.sim.positions.copy(),
            'velocities': self.sim.velocities.copy(),
            'masses': self.sim.masses.copy(),
        }
        self._frames.append(frame)

    def simulate_and_record(self, duration: float, fps: int = 30,
                           progress_callback: Optional[Callable] = None):
        """Run simulation and record frames.

        Args:
            duration: Duration in simulation time units
            fps: Frames per second to record
            progress_callback: Optional callback(frame, total_frames)
        """
        num_frames = int(duration * fps)
        dt = duration / num_frames

        self._frames = []

        for frame_idx in range(num_frames):
            self.record_frame()

            if frame_idx < num_frames - 1:
                self.sim.step(dt)

            if progress_callback:
                progress_callback(frame_idx + 1, num_frames)

        print(f"Recorded {len(self._frames)} frames")

    def export_binary(self, filepath: str, settings: Optional[ExportSettings] = None):
        """Export to optimized binary format for Niagara.

        Binary format structure:
        - Header (32 bytes):
          - Magic: 4 bytes "SNBD"
          - Version: 4 bytes (uint32)
          - NumParticles: 4 bytes (uint32)
          - NumFrames: 4 bytes (uint32)
          - FPS: 4 bytes (float32)
          - Scale: 4 bytes (float32)
          - Flags: 4 bytes (uint32) - bit flags for included data
          - Reserved: 4 bytes

        - Mass data (NumParticles * 4 bytes, float32)

        - Frame data (NumFrames * FrameSize):
          - Time: 4 bytes (float32)
          - Positions: NumParticles * 12 bytes (float32 x3)
          - Velocities: NumParticles * 12 bytes (float32 x3) [if enabled]

        Args:
            filepath: Output file path
            settings: Export settings
        """
        settings = settings or ExportSettings()

        if not self._frames:
            raise ValueError("No frames recorded. Call simulate_and_record first.")

        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        num_particles = len(self._frames[0]['positions'])
        num_frames = len(self._frames)

        # Build flags
        flags = 0
        if settings.include_velocity:
            flags |= 0x01
        if settings.include_color:
            flags |= 0x02
        if settings.include_mass:
            flags |= 0x04

        with open(filepath, 'wb') as f:
            # Write header
            f.write(b'SNBD')  # Magic
            f.write(struct.pack('<I', 1))  # Version
            f.write(struct.pack('<I', num_particles))
            f.write(struct.pack('<I', num_frames))
            f.write(struct.pack('<f', settings.fps))
            f.write(struct.pack('<f', settings.scale))
            f.write(struct.pack('<I', flags))
            f.write(struct.pack('<I', 0))  # Reserved

            # Write mass data
            masses = self._frames[0]['masses'] * settings.scale  # Scale mass too
            f.write(masses.astype(np.float32).tobytes())

            # Write frame data
            for frame in self._frames:
                # Time
                f.write(struct.pack('<f', frame['time']))

                # Positions (scaled to UE5 units - centimeters)
                positions = frame['positions'] * settings.scale
                f.write(positions.astype(np.float32).tobytes())

                # Velocities
                if settings.include_velocity:
                    velocities = frame['velocities'] * settings.scale
                    f.write(velocities.astype(np.float32).tobytes())

        file_size = filepath.stat().st_size / 1e6
        print(f"Exported binary: {filepath}")
        print(f"  Particles: {num_particles}")
        print(f"  Frames: {num_frames}")
        print(f"  File size: {file_size:.2f} MB")

    def export_csv(self, filepath: str, settings: Optional[ExportSettings] = None):
        """Export to CSV format for UE5 Data Tables.

        Creates separate files for:
        - {name}_particles.csv: Static particle data (mass, initial position)
        - {name}_frames.csv: Per-frame animation data

        Args:
            filepath: Base output file path (without extension)
            settings: Export settings
        """
        settings = settings or ExportSettings()

        if not self._frames:
            raise ValueError("No frames recorded. Call simulate_and_record first.")

        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        num_particles = len(self._frames[0]['positions'])
        scale = settings.scale

        # Export particle static data
        particles_file = filepath.parent / f"{filepath.stem}_particles.csv"
        with open(particles_file, 'w') as f:
            f.write("ParticleID,Mass,InitialX,InitialY,InitialZ\n")
            for i in range(num_particles):
                mass = self._frames[0]['masses'][i] * scale
                pos = self._frames[0]['positions'][i] * scale
                f.write(f"{i},{mass:.6f},{pos[0]:.6f},{pos[1]:.6f},{pos[2]:.6f}\n")

        print(f"Exported particle data: {particles_file}")

        # Export frame data (sampled to reduce file size)
        frames_file = filepath.parent / f"{filepath.stem}_frames.csv"
        with open(frames_file, 'w') as f:
            f.write("Frame,Time,ParticleID,X,Y,Z")
            if settings.include_velocity:
                f.write(",VX,VY,VZ")
            f.write("\n")

            for frame_idx, frame in enumerate(self._frames):
                for i in range(num_particles):
                    pos = frame['positions'][i] * scale
                    line = f"{frame_idx},{frame['time']:.6f},{i},{pos[0]:.6f},{pos[1]:.6f},{pos[2]:.6f}"

                    if settings.include_velocity:
                        vel = frame['velocities'][i] * scale
                        line += f",{vel[0]:.6f},{vel[1]:.6f},{vel[2]:.6f}"

                    f.write(line + "\n")

        print(f"Exported frame data: {frames_file}")

    def export_niagara_ndi(self, filepath: str, settings: Optional[ExportSettings] = None):
        """Export to Niagara Data Interface compatible format.

        Creates a JSON metadata file and binary data files that can be
        loaded by a custom Niagara Data Interface in UE5.

        Args:
            filepath: Output directory path
            settings: Export settings
        """
        settings = settings or ExportSettings()

        if not self._frames:
            raise ValueError("No frames recorded. Call simulate_and_record first.")

        output_dir = Path(filepath)
        output_dir.mkdir(parents=True, exist_ok=True)

        num_particles = len(self._frames[0]['positions'])
        num_frames = len(self._frames)
        scale = settings.scale

        # Export metadata
        metadata = {
            'version': 1,
            'type': 'SoupyNBody_SimulationCache',
            'num_particles': num_particles,
            'num_frames': num_frames,
            'fps': settings.fps,
            'duration': self._frames[-1]['time'] - self._frames[0]['time'],
            'scale': scale,
            'bounds': self._calculate_bounds(scale),
            'files': {
                'positions': 'positions.bin',
                'velocities': 'velocities.bin' if settings.include_velocity else None,
                'masses': 'masses.bin' if settings.include_mass else None,
            }
        }

        with open(output_dir / 'metadata.json', 'w') as f:
            json.dump(metadata, f, indent=2)

        # Export position data as contiguous array
        # Shape: (num_frames, num_particles, 3)
        all_positions = np.array([f['positions'] for f in self._frames]) * scale
        with open(output_dir / 'positions.bin', 'wb') as f:
            f.write(all_positions.astype(np.float32).tobytes())

        # Export velocity data
        if settings.include_velocity:
            all_velocities = np.array([f['velocities'] for f in self._frames]) * scale
            with open(output_dir / 'velocities.bin', 'wb') as f:
                f.write(all_velocities.astype(np.float32).tobytes())

        # Export mass data
        if settings.include_mass:
            masses = self._frames[0]['masses'] * scale
            with open(output_dir / 'masses.bin', 'wb') as f:
                f.write(masses.astype(np.float32).tobytes())

        print(f"Exported Niagara NDI format: {output_dir}")
        print(f"  Metadata: metadata.json")
        print(f"  Position data: positions.bin ({all_positions.nbytes / 1e6:.2f} MB)")

    def _calculate_bounds(self, scale: float) -> dict:
        """Calculate bounding box across all frames."""
        all_positions = np.concatenate([f['positions'] for f in self._frames])
        all_positions *= scale

        return {
            'min': all_positions.min(axis=0).tolist(),
            'max': all_positions.max(axis=0).tolist(),
        }

    def export(self, filepath: str, format: ExportFormat = ExportFormat.BINARY,
               settings: Optional[ExportSettings] = None):
        """Export recorded frames to specified format.

        Args:
            filepath: Output file path
            format: Export format
            settings: Export settings
        """
        if format == ExportFormat.BINARY:
            self.export_binary(filepath, settings)
        elif format == ExportFormat.CSV:
            self.export_csv(filepath, settings)
        elif format == ExportFormat.NIAGARA_NDI:
            self.export_niagara_ndi(filepath, settings)
        elif format == ExportFormat.JSON:
            self._export_json(filepath, settings)
        else:
            raise ValueError(f"Unsupported format: {format}")

    def _export_json(self, filepath: str, settings: Optional[ExportSettings] = None):
        """Export to JSON format (for smaller simulations)."""
        settings = settings or ExportSettings()
        scale = settings.scale

        data = {
            'version': 1,
            'num_particles': len(self._frames[0]['positions']),
            'num_frames': len(self._frames),
            'fps': settings.fps,
            'scale': scale,
            'masses': (self._frames[0]['masses'] * scale).tolist(),
            'frames': []
        }

        for frame in self._frames:
            frame_data = {
                'time': frame['time'],
                'positions': (frame['positions'] * scale).tolist(),
            }
            if settings.include_velocity:
                frame_data['velocities'] = (frame['velocities'] * scale).tolist()
            data['frames'].append(frame_data)

        with open(filepath, 'w') as f:
            json.dump(data, f)

        print(f"Exported JSON: {filepath}")


def quick_export(simulation, output_path: str, duration: float = 10.0,
                 fps: int = 30, format: ExportFormat = ExportFormat.BINARY):
    """Quick helper to simulate and export in one call.

    Args:
        simulation: REBOUNDSimulation instance
        output_path: Output file path
        duration: Simulation duration
        fps: Export frame rate
        format: Export format
    """
    exporter = UE5Exporter(simulation)

    def progress(frame, total):
        if frame % 100 == 0 or frame == total:
            print(f"  Recording frame {frame}/{total}")

    exporter.simulate_and_record(duration, fps, progress)
    exporter.export(output_path, format)
