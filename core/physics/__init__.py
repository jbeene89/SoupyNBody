"""Physics module for N-body simulation using REBOUND.

REBOUND is a professional astrophysical N-body library providing:
- Multiple high-accuracy integrators (IAS15, WHFast, Mercurius)
- Proper gravitational dynamics
- Collision detection
- Energy conservation
"""

from .nbody import (
    REBOUNDSimulation,
    NBodySimulation,  # Backwards compatibility alias
    GalaxyConfig,
    Integrator,
    REBOUND_AVAILABLE,
)

__all__ = [
    'REBOUNDSimulation',
    'NBodySimulation',
    'GalaxyConfig',
    'Integrator',
    'REBOUND_AVAILABLE',
]
