// =============================================================================
// N-Body Compute Shader for Unreal Engine 5 Niagara
// =============================================================================
//
// High-performance gravitational N-body simulation using GPU compute.
// Implements tiled computation with shared memory for optimal performance.
//
// Usage in Niagara:
// 1. Create a Niagara System with GPU Compute Simulation
// 2. Add this as a Custom HLSL Simulation Stage
// 3. Bind particle attributes to the appropriate buffers
// =============================================================================

// -----------------------------------------------------------------------------
// Buffer Definitions
// -----------------------------------------------------------------------------

// Particle position buffer (xyz = position, w = particle type/age)
RWStructuredBuffer<float4> Positions : register(u0);

// Particle velocity buffer (xyz = velocity, w = reserved)
RWStructuredBuffer<float4> Velocities : register(u1);

// Particle mass buffer
StructuredBuffer<float> Masses : register(t0);

// Particle color output (for rendering)
RWStructuredBuffer<float4> Colors : register(u2);

// -----------------------------------------------------------------------------
// Simulation Parameters (bound from Niagara User Parameters)
// -----------------------------------------------------------------------------

cbuffer NBodyParameters : register(b0)
{
    float DeltaTime;              // Simulation timestep
    float GravitationalConstant;  // G (typically 1.0 in normalized units)
    float Softening;              // Softening parameter (prevents singularities)
    float CentralMass;            // Mass of central body (black hole/bulge)

    int NumParticles;             // Total particle count
    int SimulationMode;           // 0 = full N-body, 1 = central mass only
    float GalaxyRadius;           // For color mapping
    float MaxVelocity;            // For color mapping

    float3 CentralPosition;       // Position of central mass
    float _Padding1;

    float4 ColorInner;            // Inner galaxy color (near center)
    float4 ColorOuter;            // Outer galaxy color (disk edge)
    float4 ColorHighVelocity;     // High velocity particles
};

// -----------------------------------------------------------------------------
// Shared Memory for Tiled Computation
// -----------------------------------------------------------------------------

#define TILE_SIZE 256

groupshared float4 SharedPositions[TILE_SIZE];
groupshared float SharedMasses[TILE_SIZE];

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

// Fast inverse square root (Newton-Raphson refinement)
float FastInvSqrt(float x)
{
    return rsqrt(x);
}

// Compute gravitational acceleration from a single body
float3 ComputeAcceleration(float3 myPos, float3 otherPos, float otherMass, float softening, float G)
{
    float3 r = otherPos - myPos;
    float distSq = dot(r, r) + softening * softening;
    float invDist = FastInvSqrt(distSq);
    float invDistCube = invDist * invDist * invDist;
    return G * otherMass * invDistCube * r;
}

// Leapfrog (Verlet) integration - symplectic, energy-conserving
void LeapfrogIntegrate(inout float3 pos, inout float3 vel, float3 acc, float dt)
{
    // Kick-Drift-Kick form
    vel += 0.5f * dt * acc;
    pos += dt * vel;
    vel += 0.5f * dt * acc;
}

// Map particle properties to color
float4 ComputeParticleColor(float3 pos, float3 vel, float radius, float maxVel,
                            float4 colorInner, float4 colorOuter, float4 colorHighVel)
{
    // Distance-based color
    float dist = length(pos.xy); // Use XY plane distance for disk galaxies
    float normalizedDist = saturate(dist / radius);
    float4 baseColor = lerp(colorInner, colorOuter, normalizedDist);

    // Velocity-based brightness boost
    float speed = length(vel);
    float normalizedSpeed = saturate(speed / maxVel);
    float4 velColor = lerp(baseColor, colorHighVel, normalizedSpeed * 0.5f);

    // Add slight variation based on z-height (disk thickness visualization)
    float heightFactor = 1.0f - saturate(abs(pos.z) / (radius * 0.1f)) * 0.3f;
    velColor.rgb *= heightFactor;

    // Alpha based on distance (fade outer particles slightly)
    velColor.a = 1.0f - normalizedDist * 0.3f;

    return velColor;
}

// -----------------------------------------------------------------------------
// Main Compute Shader - Full N-Body
// -----------------------------------------------------------------------------

[numthreads(TILE_SIZE, 1, 1)]
void CS_NBodyFull(uint3 DTid : SV_DispatchThreadID, uint3 GTid : SV_GroupThreadID, uint3 Gid : SV_GroupID)
{
    uint particleIndex = DTid.x;

    // Early exit for out-of-bounds threads
    if (particleIndex >= (uint)NumParticles)
        return;

    // Load this particle's data
    float3 myPos = Positions[particleIndex].xyz;
    float3 myVel = Velocities[particleIndex].xyz;
    float myMass = Masses[particleIndex];

    // Accumulate acceleration from all other particles
    float3 totalAcc = float3(0, 0, 0);

    // Process particles in tiles using shared memory
    uint numTiles = ((uint)NumParticles + TILE_SIZE - 1) / TILE_SIZE;

    for (uint tile = 0; tile < numTiles; tile++)
    {
        // Collaboratively load tile into shared memory
        uint loadIndex = tile * TILE_SIZE + GTid.x;

        if (loadIndex < (uint)NumParticles)
        {
            SharedPositions[GTid.x] = Positions[loadIndex];
            SharedMasses[GTid.x] = Masses[loadIndex];
        }
        else
        {
            SharedPositions[GTid.x] = float4(0, 0, 0, 0);
            SharedMasses[GTid.x] = 0;
        }

        // Synchronize to ensure all threads have loaded
        GroupMemoryBarrierWithGroupSync();

        // Compute acceleration from all particles in this tile
        [unroll(16)] // Partial unroll for performance
        for (uint j = 0; j < TILE_SIZE; j++)
        {
            uint otherIndex = tile * TILE_SIZE + j;

            // Skip self-interaction and out-of-bounds
            if (otherIndex >= (uint)NumParticles || otherIndex == particleIndex)
                continue;

            // Skip particles with zero mass
            if (SharedMasses[j] <= 0)
                continue;

            totalAcc += ComputeAcceleration(
                myPos,
                SharedPositions[j].xyz,
                SharedMasses[j],
                Softening,
                GravitationalConstant
            );
        }

        // Synchronize before loading next tile
        GroupMemoryBarrierWithGroupSync();
    }

    // Integrate motion using leapfrog
    LeapfrogIntegrate(myPos, myVel, totalAcc, DeltaTime);

    // Write back updated position and velocity
    Positions[particleIndex] = float4(myPos, Positions[particleIndex].w);
    Velocities[particleIndex] = float4(myVel, 0);

    // Update particle color for rendering
    Colors[particleIndex] = ComputeParticleColor(
        myPos, myVel, GalaxyRadius, MaxVelocity,
        ColorInner, ColorOuter, ColorHighVelocity
    );
}

// -----------------------------------------------------------------------------
// Simplified Mode - Central Mass Only (Much Faster)
// -----------------------------------------------------------------------------
// Use this mode for mobile/VR or very high particle counts
// Assumes particles orbit a dominant central mass

[numthreads(TILE_SIZE, 1, 1)]
void CS_NBodyCentralMass(uint3 DTid : SV_DispatchThreadID)
{
    uint particleIndex = DTid.x;

    if (particleIndex >= (uint)NumParticles)
        return;

    // Skip the central mass itself (index 0)
    if (particleIndex == 0)
        return;

    float3 myPos = Positions[particleIndex].xyz;
    float3 myVel = Velocities[particleIndex].xyz;

    // Only compute acceleration from central mass
    float3 acc = ComputeAcceleration(
        myPos,
        CentralPosition,
        CentralMass,
        Softening,
        GravitationalConstant
    );

    // Integrate
    LeapfrogIntegrate(myPos, myVel, acc, DeltaTime);

    // Write back
    Positions[particleIndex] = float4(myPos, Positions[particleIndex].w);
    Velocities[particleIndex] = float4(myVel, 0);

    // Update color
    Colors[particleIndex] = ComputeParticleColor(
        myPos, myVel, GalaxyRadius, MaxVelocity,
        ColorInner, ColorOuter, ColorHighVelocity
    );
}

// -----------------------------------------------------------------------------
// Galaxy Initialization Shader
// -----------------------------------------------------------------------------
// Run once at spawn to set up initial galaxy configuration

[numthreads(TILE_SIZE, 1, 1)]
void CS_InitializeGalaxy(uint3 DTid : SV_DispatchThreadID)
{
    uint particleIndex = DTid.x;

    if (particleIndex >= (uint)NumParticles)
        return;

    // Use particle index as random seed
    uint seed = particleIndex * 1103515245u + 12345u;

    // Simple hash-based random
    float Random()
    {
        seed = seed * 1103515245u + 12345u;
        return float(seed & 0x7FFFFFFFu) / float(0x7FFFFFFF);
    }

    // Central mass at index 0
    if (particleIndex == 0)
    {
        Positions[0] = float4(0, 0, 0, 1);
        Velocities[0] = float4(0, 0, 0, 0);
        Colors[0] = float4(1, 1, 0.8f, 1); // Bright yellow-white
        return;
    }

    // Exponential disk distribution
    float u = Random();
    float r = -GalaxyRadius * 0.3f * log(1.0f - u * 0.95f);
    r = clamp(r, 0.1f, GalaxyRadius);

    float theta = Random() * 6.28318530718f; // 2*PI

    // Position
    float3 pos;
    pos.x = r * cos(theta);
    pos.y = r * sin(theta);
    pos.z = (Random() - 0.5f) * GalaxyRadius * 0.05f * exp(-r / GalaxyRadius);

    // Circular velocity
    float vCirc = sqrt(GravitationalConstant * CentralMass / r);

    // Add small velocity dispersion
    float dispersion = 0.1f * vCirc;

    float3 vel;
    vel.x = -vCirc * sin(theta) + dispersion * (Random() - 0.5f);
    vel.y = vCirc * cos(theta) + dispersion * (Random() - 0.5f);
    vel.z = dispersion * 0.5f * (Random() - 0.5f);

    // Write initial state
    Positions[particleIndex] = float4(pos, 0);
    Velocities[particleIndex] = float4(vel, 0);

    // Initial color
    Colors[particleIndex] = ComputeParticleColor(
        pos, vel, GalaxyRadius, MaxVelocity,
        ColorInner, ColorOuter, ColorHighVelocity
    );
}
