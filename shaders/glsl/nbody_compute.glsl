#version 430

layout(local_size_x = 256) in;

// Particle data buffers
layout(std430, binding = 0) buffer PositionBuffer {
    vec4 positions[];
};

layout(std430, binding = 1) buffer VelocityBuffer {
    vec4 velocities[];
};

layout(std430, binding = 2) buffer MassBuffer {
    float masses[];
};

// Simulation parameters
uniform float dt;
uniform float G;
uniform float softening;
uniform int num_particles;

shared vec4 shared_positions[256];
shared float shared_masses[256];

void main() {
    uint gid = gl_GlobalInvocationID.x;

    if (gid >= num_particles) {
        return;
    }

    vec3 pos = positions[gid].xyz;
    vec3 vel = velocities[gid].xyz;
    vec3 acc = vec3(0.0);

    // Calculate gravitational acceleration from all other particles
    // Using shared memory tiling for better performance
    uint num_tiles = (num_particles + 255) / 256;

    for (uint tile = 0; tile < num_tiles; tile++) {
        uint idx = tile * 256 + gl_LocalInvocationID.x;

        // Load tile data into shared memory
        if (idx < num_particles) {
            shared_positions[gl_LocalInvocationID.x] = positions[idx];
            shared_masses[gl_LocalInvocationID.x] = masses[idx];
        } else {
            shared_positions[gl_LocalInvocationID.x] = vec4(0.0);
            shared_masses[gl_LocalInvocationID.x] = 0.0;
        }

        barrier();
        memoryBarrierShared();

        // Compute acceleration contributions from this tile
        for (uint j = 0; j < 256; j++) {
            uint other_idx = tile * 256 + j;
            if (other_idx >= num_particles || other_idx == gid) {
                continue;
            }

            vec3 r = shared_positions[j].xyz - pos;
            float dist_sq = dot(r, r) + softening * softening;
            float inv_dist = inversesqrt(dist_sq);
            float inv_dist_cube = inv_dist * inv_dist * inv_dist;

            acc += G * shared_masses[j] * inv_dist_cube * r;
        }

        barrier();
    }

    // Leapfrog integration (kick-drift-kick combined)
    // Half kick
    vel += 0.5 * dt * acc;

    // Drift
    pos += dt * vel;

    // Recalculate acceleration at new position
    // (Simplified: we use the same acceleration for the second kick)
    // For more accuracy, this would need a second pass

    // Second half kick
    vel += 0.5 * dt * acc;

    // Write back results
    positions[gid] = vec4(pos, 1.0);
    velocities[gid] = vec4(vel, 0.0);
}
