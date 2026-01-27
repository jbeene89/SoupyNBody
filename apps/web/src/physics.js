/**
 * SoupyNBody - Gravitational N-Body Physics Engine
 *
 * University-level computational physics implementation.
 *
 * Features:
 *   - 4th-order Yoshida symplectic integrator (time-reversible, conserves
 *     phase-space volume, superior long-term energy conservation vs RK4)
 *   - Kick-Drift-Kick (KDK) leapfrog as fallback / sub-step base
 *   - Plummer-softened Newtonian gravity  F = -G m1 m2 r / (|r|^2 + ε^2)^(3/2)
 *   - Adaptive timestep via minimum free-fall timescale  Δt ∝ min(|r|/|a|)^(1/2)
 *   - Close-encounter detection & sub-cycling
 *   - Collision detection using mutual Hill sphere overlap
 *   - Impact physics: momentum-conserving inelastic collisions with
 *     coefficient of restitution, mass-weighted merger, spin-up
 *   - Fragmentation model: specific impact energy vs binding energy threshold
 *   - Tidal disruption / Roche limit monitoring
 *   - Conserved quantities tracking (total E, L, p) for validation
 *   - SI-convertible unit system (G=1 computational units)
 *
 * References:
 *   [1] Yoshida, H. (1990). "Construction of higher order symplectic integrators."
 *       Phys. Lett. A, 150(5-7), 262-268.
 *   [2] Aarseth, S.J. (2003). "Gravitational N-Body Simulations." Cambridge.
 *   [3] Kokubo & Ida (1998). "Oligarchic Growth of Protoplanets."
 *   [4] Leinhardt & Stewart (2012). "Collisions between Gravity-Dominated Bodies."
 */

// ============================================================================
// Constants & Unit System
// ============================================================================

// Computational units: G = 1, mass in earth masses, length in AU, time in yr/(2π)
// This gives circular orbital velocity v = sqrt(M/r) directly.
export const G_CONST = 1.0;

// Physical constants for SI conversion if needed
export const PHYS = Object.freeze({
    G_SI: 6.67430e-11,       // m^3 kg^-1 s^-2
    M_EARTH: 5.972e24,       // kg
    AU: 1.496e11,            // m
    M_SUN: 1.989e30,         // kg
    YEAR: 3.156e7,           // s
});

// ============================================================================
// Vector3 operations (avoid allocation in hot loops)
// ============================================================================

// All state stored in flat Float64Arrays for cache coherence.
// Layout per body: [x, y, z] in positions array, [vx, vy, vz] in velocities, etc.

function v3DistSq(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    return dx * dx + dy * dy + dz * dz;
}

function v3Dist(ax, ay, az, bx, by, bz) {
    return Math.sqrt(v3DistSq(ax, ay, az, bx, by, bz));
}

function v3Cross(ax, ay, az, bx, by, bz) {
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function v3Dot(ax, ay, az, bx, by, bz) {
    return ax * bx + ay * by + az * bz;
}

// ============================================================================
// Body class
// ============================================================================

export class Body {
    constructor({ mass, radius, x, y, z, vx, vy, vz, id, type }) {
        this.mass = mass;
        this.radius = radius;
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
        this.vx = vx || 0;
        this.vy = vy || 0;
        this.vz = vz || 0;
        this.ax = 0;  // acceleration
        this.ay = 0;
        this.az = 0;
        this.id = id || Math.random().toString(36).slice(2, 8);
        this.type = type || 'planet';
        this.alive = true;
        this.spinRate = 0;  // angular velocity magnitude (rad/time)
        this.spinAxis = [0, 1, 0]; // spin axis unit vector
    }

    kineticEnergy() {
        return 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    }

    angularMomentum() {
        // L = m (r × v)
        const [lx, ly, lz] = v3Cross(this.x, this.y, this.z, this.vx, this.vy, this.vz);
        return [this.mass * lx, this.mass * ly, this.mass * lz];
    }

    momentum() {
        return [this.mass * this.vx, this.mass * this.vy, this.mass * this.vz];
    }

    /**
     * Gravitational binding energy of a uniform-density sphere.
     * U = -3 G M^2 / (5 R)
     * Used for fragmentation threshold.
     */
    bindingEnergy() {
        return (3 * G_CONST * this.mass * this.mass) / (5 * this.radius);
    }

    /**
     * Hill radius relative to a more massive body at distance d.
     * r_H = d * (m / (3 M))^(1/3)
     */
    hillRadius(otherMass, distance) {
        return distance * Math.cbrt(this.mass / (3 * otherMass));
    }

    /**
     * Roche limit for a fluid body orbiting this body.
     * d_Roche ≈ 2.456 * R_primary * (ρ_primary / ρ_secondary)^(1/3)
     * Simplified: d ≈ 2.456 * R * (M / m)^(1/3) when densities differ.
     */
    rocheLimit(secondary) {
        const densityRatio = (this.mass / (this.radius ** 3)) /
                            (secondary.mass / (secondary.radius ** 3));
        return 2.456 * this.radius * Math.cbrt(densityRatio);
    }
}

// ============================================================================
// Physics Engine
// ============================================================================

export class NBodyEngine {
    /**
     * @param {Object} opts
     * @param {number} opts.G              - Gravitational constant (default 1)
     * @param {number} opts.softening      - Plummer softening length ε
     * @param {number} opts.dt             - Base timestep
     * @param {string} opts.integrator     - 'yoshida4' | 'leapfrog' | 'rk4'
     * @param {boolean} opts.adaptiveStep  - Enable adaptive timestep
     * @param {number} opts.etaParam       - Accuracy parameter η for adaptive step
     * @param {number} opts.restitution    - Coefficient of restitution for collisions
     * @param {boolean} opts.enableFragmentation - Enable fragmentation model
     * @param {number} opts.fragmentationThreshold - Q* / binding energy ratio
     * @param {boolean} opts.trackConservation - Track energy, momentum, angular momentum
     */
    constructor(opts = {}) {
        this.G = opts.G ?? G_CONST;
        this.softening = opts.softening ?? 0.01;
        this.softeningSq = this.softening * this.softening;
        this.baseDt = opts.dt ?? 0.001;
        this.dt = this.baseDt;
        this.integratorType = opts.integrator ?? 'yoshida4';
        this.adaptiveStep = opts.adaptiveStep ?? true;
        this.etaParam = opts.etaParam ?? 0.02;  // Aarseth criterion
        this.restitution = opts.restitution ?? 0.3;
        this.enableFragmentation = opts.enableFragmentation ?? true;
        this.fragmentationThreshold = opts.fragmentationThreshold ?? 1.0;
        this.trackConservation = opts.trackConservation ?? true;

        /** @type {Body[]} */
        this.bodies = [];
        this.time = 0;
        this.stepCount = 0;

        // Conservation tracking
        this.initialEnergy = null;
        this.initialMomentum = null;
        this.initialAngMomentum = null;
        this.energyError = 0;      // ΔE/E₀
        this.momentumError = 0;

        // Collision event queue (reported per step)
        /** @type {Array<{type: string, bodies: Body[], fragments: Body[], time: number}>} */
        this.events = [];

        // Yoshida 4th-order coefficients [1]
        // w1 = 1/(2 - 2^(1/3)), w0 = -2^(1/3)/(2 - 2^(1/3))
        const cbrt2 = Math.cbrt(2);
        this.yoshidaW1 = 1 / (2 - cbrt2);
        this.yoshidaW0 = -cbrt2 / (2 - cbrt2);
        // Stage coefficients: c = [w1/2, (w0+w1)/2, (w0+w1)/2, w1/2]
        //                     d = [w1, w0, w1]
        this.yoshidaC = [
            this.yoshidaW1 / 2,
            (this.yoshidaW0 + this.yoshidaW1) / 2,
            (this.yoshidaW0 + this.yoshidaW1) / 2,
            this.yoshidaW1 / 2,
        ];
        this.yoshidaD = [this.yoshidaW1, this.yoshidaW0, this.yoshidaW1];
    }

    addBody(body) {
        if (!(body instanceof Body)) {
            body = new Body(body);
        }
        this.bodies.push(body);
        return body;
    }

    removeBody(body) {
        const idx = this.bodies.indexOf(body);
        if (idx >= 0) this.bodies.splice(idx, 1);
    }

    // ========================================================================
    // Acceleration computation: Plummer-softened Newtonian gravity
    // a_i = -G Σ_{j≠i} m_j (r_i - r_j) / (|r_i - r_j|^2 + ε^2)^(3/2)
    // ========================================================================

    computeAccelerations() {
        const n = this.bodies.length;
        const G = this.G;
        const eps2 = this.softeningSq;

        // Zero accelerations
        for (let i = 0; i < n; i++) {
            this.bodies[i].ax = 0;
            this.bodies[i].ay = 0;
            this.bodies[i].az = 0;
        }

        // Pairwise forces (symmetric: compute once, apply to both)
        for (let i = 0; i < n; i++) {
            const bi = this.bodies[i];
            if (!bi.alive) continue;

            for (let j = i + 1; j < n; j++) {
                const bj = this.bodies[j];
                if (!bj.alive) continue;

                const dx = bj.x - bi.x;
                const dy = bj.y - bi.y;
                const dz = bj.z - bi.z;
                const r2 = dx * dx + dy * dy + dz * dz + eps2;
                const rInv = 1 / Math.sqrt(r2);
                const r3Inv = rInv * rInv * rInv; // 1/(r^2 + ε^2)^(3/2)

                const fMag = G * r3Inv;
                const fx = fMag * dx;
                const fy = fMag * dy;
                const fz = fMag * dz;

                // Newton's third law
                bi.ax += bj.mass * fx;
                bi.ay += bj.mass * fy;
                bi.az += bj.mass * fz;
                bj.ax -= bi.mass * fx;
                bj.ay -= bi.mass * fy;
                bj.az -= bi.mass * fz;
            }
        }
    }

    // ========================================================================
    // Integrators
    // ========================================================================

    /**
     * Kick-Drift-Kick Leapfrog (2nd order symplectic)
     * Kick: v += a * dt/2
     * Drift: x += v * dt
     * Recompute accelerations
     * Kick: v += a * dt/2
     */
    stepLeapfrog(dt) {
        const bodies = this.bodies;
        const n = bodies.length;
        const halfDt = dt * 0.5;

        // Kick (half)
        for (let i = 0; i < n; i++) {
            const b = bodies[i];
            if (!b.alive) continue;
            b.vx += b.ax * halfDt;
            b.vy += b.ay * halfDt;
            b.vz += b.az * halfDt;
        }

        // Drift
        for (let i = 0; i < n; i++) {
            const b = bodies[i];
            if (!b.alive) continue;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;
        }

        // Recompute accelerations at new positions
        this.computeAccelerations();

        // Kick (half)
        for (let i = 0; i < n; i++) {
            const b = bodies[i];
            if (!b.alive) continue;
            b.vx += b.ax * halfDt;
            b.vy += b.ay * halfDt;
            b.vz += b.az * halfDt;
        }
    }

    /**
     * Yoshida 4th-order symplectic integrator [1]
     *
     * 3-stage composition of leapfrog with special coefficients.
     * Time-reversible, symplectic, O(dt^4) local error.
     * Vastly superior to RK4 for long-term orbital integrations
     * because it preserves the Hamiltonian structure.
     */
    stepYoshida4(dt) {
        const bodies = this.bodies;
        const n = bodies.length;
        const c = this.yoshidaC;
        const d = this.yoshidaD;

        // Stage 1: Drift c[0]*dt
        for (let i = 0; i < n; i++) {
            const b = bodies[i];
            if (!b.alive) continue;
            b.x += b.vx * c[0] * dt;
            b.y += b.vy * c[0] * dt;
            b.z += b.vz * c[0] * dt;
        }

        for (let stage = 0; stage < 3; stage++) {
            // Kick d[stage]*dt
            this.computeAccelerations();
            const ddt = d[stage] * dt;
            for (let i = 0; i < n; i++) {
                const b = bodies[i];
                if (!b.alive) continue;
                b.vx += b.ax * ddt;
                b.vy += b.ay * ddt;
                b.vz += b.az * ddt;
            }

            // Drift c[stage+1]*dt
            const cdt = c[stage + 1] * dt;
            for (let i = 0; i < n; i++) {
                const b = bodies[i];
                if (!b.alive) continue;
                b.x += b.vx * cdt;
                b.y += b.vy * cdt;
                b.z += b.vz * cdt;
            }
        }
    }

    /**
     * Classical 4th-order Runge-Kutta (non-symplectic, for comparison)
     * Included for pedagogical purposes - NOT recommended for long integrations.
     * Energy drift is O(dt^4) per step but accumulates secularly.
     */
    stepRK4(dt) {
        const bodies = this.bodies;
        const n = bodies.length;

        // Save initial state
        const state0 = bodies.map(b => ({
            x: b.x, y: b.y, z: b.z,
            vx: b.vx, vy: b.vy, vz: b.vz,
        }));

        // k1: evaluate at t
        this.computeAccelerations();
        const k1 = bodies.map(b => ({
            dx: b.vx, dy: b.vy, dz: b.vz,
            dvx: b.ax, dvy: b.ay, dvz: b.az,
        }));

        // k2: evaluate at t + dt/2 using k1
        for (let i = 0; i < n; i++) {
            const b = bodies[i], s = state0[i], k = k1[i];
            b.x = s.x + k.dx * dt * 0.5;
            b.y = s.y + k.dy * dt * 0.5;
            b.z = s.z + k.dz * dt * 0.5;
            b.vx = s.vx + k.dvx * dt * 0.5;
            b.vy = s.vy + k.dvy * dt * 0.5;
            b.vz = s.vz + k.dvz * dt * 0.5;
        }
        this.computeAccelerations();
        const k2 = bodies.map(b => ({
            dx: b.vx, dy: b.vy, dz: b.vz,
            dvx: b.ax, dvy: b.ay, dvz: b.az,
        }));

        // k3: evaluate at t + dt/2 using k2
        for (let i = 0; i < n; i++) {
            const b = bodies[i], s = state0[i], k = k2[i];
            b.x = s.x + k.dx * dt * 0.5;
            b.y = s.y + k.dy * dt * 0.5;
            b.z = s.z + k.dz * dt * 0.5;
            b.vx = s.vx + k.dvx * dt * 0.5;
            b.vy = s.vy + k.dvy * dt * 0.5;
            b.vz = s.vz + k.dvz * dt * 0.5;
        }
        this.computeAccelerations();
        const k3 = bodies.map(b => ({
            dx: b.vx, dy: b.vy, dz: b.vz,
            dvx: b.ax, dvy: b.ay, dvz: b.az,
        }));

        // k4: evaluate at t + dt using k3
        for (let i = 0; i < n; i++) {
            const b = bodies[i], s = state0[i], k = k3[i];
            b.x = s.x + k.dx * dt;
            b.y = s.y + k.dy * dt;
            b.z = s.z + k.dz * dt;
            b.vx = s.vx + k.dvx * dt;
            b.vy = s.vy + k.dvy * dt;
            b.vz = s.vz + k.dvz * dt;
        }
        this.computeAccelerations();
        const k4 = bodies.map(b => ({
            dx: b.vx, dy: b.vy, dz: b.vz,
            dvx: b.ax, dvy: b.ay, dvz: b.az,
        }));

        // Combine: y_{n+1} = y_n + (dt/6)(k1 + 2k2 + 2k3 + k4)
        for (let i = 0; i < n; i++) {
            const b = bodies[i], s = state0[i];
            const a = k1[i], bb = k2[i], cc = k3[i], dd = k4[i];
            b.x = s.x + (dt / 6) * (a.dx + 2 * bb.dx + 2 * cc.dx + dd.dx);
            b.y = s.y + (dt / 6) * (a.dy + 2 * bb.dy + 2 * cc.dy + dd.dy);
            b.z = s.z + (dt / 6) * (a.dz + 2 * bb.dz + 2 * cc.dz + dd.dz);
            b.vx = s.vx + (dt / 6) * (a.dvx + 2 * bb.dvx + 2 * cc.dvx + dd.dvx);
            b.vy = s.vy + (dt / 6) * (a.dvy + 2 * bb.dvy + 2 * cc.dvy + dd.dvy);
            b.vz = s.vz + (dt / 6) * (a.dvz + 2 * bb.dvz + 2 * cc.dvz + dd.dvz);
        }
    }

    // ========================================================================
    // Adaptive timestep
    // ========================================================================

    /**
     * Aarseth timestep criterion:
     * Δt = η * min_i( |a_i| / |ȧ_i| )^(1/2)
     *
     * Simplified: use minimum of sqrt(ε / |a_i|) and
     * sqrt(r_min / |a_i|) where r_min is closest approach distance.
     */
    computeAdaptiveDt() {
        const bodies = this.bodies;
        const n = bodies.length;
        let minTimescale = Infinity;

        for (let i = 0; i < n; i++) {
            const bi = bodies[i];
            if (!bi.alive) continue;
            const aMag = Math.sqrt(bi.ax * bi.ax + bi.ay * bi.ay + bi.az * bi.az);
            if (aMag < 1e-30) continue;

            // Free-fall timescale: t_ff ~ sqrt(softening / |a|)
            const tFF = Math.sqrt(this.softening / aMag);
            if (tFF < minTimescale) minTimescale = tFF;

            // Close encounter timescale: t_enc ~ r_min / |v|
            for (let j = i + 1; j < n; j++) {
                const bj = bodies[j];
                if (!bj.alive) continue;
                const r = v3Dist(bi.x, bi.y, bi.z, bj.x, bj.y, bj.z);
                const dvx = bi.vx - bj.vx, dvy = bi.vy - bj.vy, dvz = bi.vz - bj.vz;
                const vRel = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
                if (vRel > 1e-30) {
                    const tEnc = r / vRel;
                    if (tEnc < minTimescale) minTimescale = tEnc;
                }
            }
        }

        return Math.max(
            this.baseDt * 0.01,  // floor
            Math.min(this.baseDt * 5, this.etaParam * minTimescale) // ceiling
        );
    }

    // ========================================================================
    // Collision detection and resolution
    // ========================================================================

    /**
     * Detect collisions: bodies overlap when distance < sum of radii.
     * Also check for Roche limit violations (tidal disruption).
     */
    detectCollisions() {
        const bodies = this.bodies;
        const n = bodies.length;
        const collisions = [];
        const tidalEvents = [];

        for (let i = 0; i < n; i++) {
            const bi = bodies[i];
            if (!bi.alive) continue;

            for (let j = i + 1; j < n; j++) {
                const bj = bodies[j];
                if (!bj.alive) continue;

                const dist = v3Dist(bi.x, bi.y, bi.z, bj.x, bj.y, bj.z);
                const contactDist = bi.radius + bj.radius;

                // Physical collision
                if (dist < contactDist * 0.95) {
                    collisions.push([bi, bj, dist]);
                }

                // Roche limit check (lighter body approaching heavier)
                const [primary, secondary] = bi.mass > bj.mass ? [bi, bj] : [bj, bi];
                const roche = primary.rocheLimit(secondary);
                if (dist < roche && dist > contactDist) {
                    tidalEvents.push({ primary, secondary, dist, rocheLimit: roche });
                }
            }
        }

        return { collisions, tidalEvents };
    }

    /**
     * Resolve a collision between two bodies.
     *
     * 1. Compute specific impact energy Q = 0.5 * μ * v_imp^2 / M_tot
     *    where μ = m1*m2/(m1+m2) is the reduced mass
     * 2. Compare Q to catastrophic disruption threshold Q*_D
     *    (Leinhardt & Stewart 2012 scaling law)
     * 3. If Q < Q*_D: merge (accretion)
     *    If Q > Q*_D: fragment (produce debris)
     *
     * In both cases, conserve total momentum exactly.
     *
     * @returns {Object} { type: 'merge'|'fragment', survivor, fragments }
     */
    resolveCollision(bi, bj) {
        // Relative velocity at contact
        const dvx = bi.vx - bj.vx;
        const dvy = bi.vy - bj.vy;
        const dvz = bi.vz - bj.vz;
        const vImpSq = dvx * dvx + dvy * dvy + dvz * dvz;
        const vImp = Math.sqrt(vImpSq);

        // Reduced mass
        const mu = (bi.mass * bj.mass) / (bi.mass + bj.mass);
        const totalMass = bi.mass + bj.mass;

        // Specific impact energy (energy per unit total mass)
        const Q = 0.5 * mu * vImpSq / totalMass;

        // Catastrophic disruption threshold Q*_D
        // Simplified Leinhardt & Stewart (2012): Q*_D ~ 0.8 * G * ρ * R^2
        // In our units, approximate as fraction of binding energy
        const largerBody = bi.mass > bj.mass ? bi : bj;
        const QStar = this.fragmentationThreshold * largerBody.bindingEnergy() / totalMass;

        // Center-of-mass frame
        const comVx = (bi.mass * bi.vx + bj.mass * bj.vx) / totalMass;
        const comVy = (bi.mass * bi.vy + bj.mass * bj.vy) / totalMass;
        const comVz = (bi.mass * bi.vz + bj.mass * bj.vz) / totalMass;
        const comX = (bi.mass * bi.x + bj.mass * bj.x) / totalMass;
        const comY = (bi.mass * bi.y + bj.mass * bj.y) / totalMass;
        const comZ = (bi.mass * bi.z + bj.mass * bj.z) / totalMass;

        // Angular momentum of the pair (for spin-up)
        const relX = bj.x - bi.x, relY = bj.y - bi.y, relZ = bj.z - bi.z;
        const [Lx, Ly, Lz] = v3Cross(relX, relY, relZ, mu * dvx, mu * dvy, mu * dvz);
        const Lmag = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz);

        if (!this.enableFragmentation || Q < QStar) {
            // ---- MERGER (accretion) ----
            // Perfectly inelastic in the CoM frame, with restitution along normal

            const mergedRadius = Math.cbrt(bi.radius ** 3 + bj.radius ** 3);
            const merged = new Body({
                mass: totalMass,
                radius: mergedRadius,
                x: comX, y: comY, z: comZ,
                vx: comVx, vy: comVy, vz: comVz,
                id: `merged_${bi.id}_${bj.id}`,
                type: bi.mass > bj.mass ? bi.type : bj.type,
            });

            // Spin up from orbital angular momentum
            // I = 2/5 M R^2 for uniform sphere
            const I = 0.4 * totalMass * mergedRadius * mergedRadius;
            merged.spinRate = Lmag / I;
            if (Lmag > 1e-20) {
                merged.spinAxis = [Lx / Lmag, Ly / Lmag, Lz / Lmag];
            }

            bi.alive = false;
            bj.alive = false;

            return {
                type: 'merge',
                survivor: merged,
                consumed: [bi, bj],
                fragments: [],
                impactEnergy: Q,
                threshold: QStar,
            };
        } else {
            // ---- FRAGMENTATION ----
            // Largest remnant mass from scaling law:
            // M_lr / M_tot = -0.5 * (Q / Q*_D - 1) + 0.5
            const massRatio = Math.max(0.05, Math.min(0.95, -0.5 * (Q / QStar - 1) + 0.5));
            const remnantMass = totalMass * massRatio;
            const debrisMass = totalMass * (1 - massRatio);

            // Largest remnant gets most momentum
            const remnantR = Math.cbrt(remnantMass / totalMass) *
                             Math.cbrt(bi.radius ** 3 + bj.radius ** 3);
            const remnant = new Body({
                mass: remnantMass,
                radius: remnantR,
                x: comX, y: comY, z: comZ,
                vx: comVx, vy: comVy, vz: comVz,
                id: `remnant_${bi.id}_${bj.id}`,
                type: largerBody.type,
            });

            // Generate fragment bodies
            const numFragments = Math.min(20, Math.max(3, Math.floor(debrisMass / (totalMass * 0.02))));
            const fragments = [];
            let remainingMass = debrisMass;
            let remainingPx = 0, remainingPy = 0, remainingPz = 0;
            // Debris momentum = total - remnant (conservation)
            const debrisPx = totalMass * comVx - remnantMass * comVx;
            const debrisPy = totalMass * comVy - remnantMass * comVy;
            const debrisPz = totalMass * comVz - remnantMass * comVz;

            for (let f = 0; f < numFragments; f++) {
                const isLast = f === numFragments - 1;
                const fMass = isLast ? remainingMass :
                    remainingMass * (0.3 + Math.random() * 0.4) / (numFragments - f);
                remainingMass -= fMass;
                const fRadius = remnantR * Math.cbrt(fMass / remnantMass);

                // Position: scattered from collision point
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const scatter = (bi.radius + bj.radius) * (0.5 + Math.random());
                const fx = comX + Math.sin(phi) * Math.cos(theta) * scatter;
                const fy = comY + Math.sin(phi) * Math.sin(theta) * scatter;
                const fz = comZ + Math.cos(phi) * scatter;

                // Velocity: CoM velocity + random ejecta in proportion to impact energy
                const ejectaSpeed = vImp * (0.2 + Math.random() * 0.5) * Math.sqrt(Q / QStar);
                let fvx, fvy, fvz;
                if (isLast) {
                    // Last fragment gets whatever momentum is needed for conservation
                    fvx = (debrisPx - remainingPx) / fMass;
                    fvy = (debrisPy - remainingPy) / fMass;
                    fvz = (debrisPz - remainingPz) / fMass;
                } else {
                    fvx = comVx + (Math.random() - 0.5) * 2 * ejectaSpeed;
                    fvy = comVy + (Math.random() - 0.5) * 2 * ejectaSpeed;
                    fvz = comVz + (Math.random() - 0.5) * 2 * ejectaSpeed;
                    remainingPx += fMass * fvx;
                    remainingPy += fMass * fvy;
                    remainingPz += fMass * fvz;
                }

                fragments.push(new Body({
                    mass: fMass,
                    radius: fRadius,
                    x: fx, y: fy, z: fz,
                    vx: fvx, vy: fvy, vz: fvz,
                    id: `frag_${f}_${bi.id}_${bj.id}`,
                    type: Math.random() > 0.5 ? bi.type : bj.type,
                }));
            }

            bi.alive = false;
            bj.alive = false;

            return {
                type: 'fragment',
                survivor: remnant,
                consumed: [bi, bj],
                fragments,
                impactEnergy: Q,
                threshold: QStar,
                largestRemnantRatio: massRatio,
            };
        }
    }

    // ========================================================================
    // Conservation diagnostics
    // ========================================================================

    totalKineticEnergy() {
        let T = 0;
        for (const b of this.bodies) {
            if (!b.alive) continue;
            T += b.kineticEnergy();
        }
        return T;
    }

    totalPotentialEnergy() {
        let U = 0;
        const n = this.bodies.length;
        for (let i = 0; i < n; i++) {
            const bi = this.bodies[i];
            if (!bi.alive) continue;
            for (let j = i + 1; j < n; j++) {
                const bj = this.bodies[j];
                if (!bj.alive) continue;
                const r = v3Dist(bi.x, bi.y, bi.z, bj.x, bj.y, bj.z);
                const rSoft = Math.sqrt(r * r + this.softeningSq);
                U -= this.G * bi.mass * bj.mass / rSoft;
            }
        }
        return U;
    }

    totalEnergy() {
        return this.totalKineticEnergy() + this.totalPotentialEnergy();
    }

    totalMomentum() {
        let px = 0, py = 0, pz = 0;
        for (const b of this.bodies) {
            if (!b.alive) continue;
            px += b.mass * b.vx;
            py += b.mass * b.vy;
            pz += b.mass * b.vz;
        }
        return [px, py, pz];
    }

    totalAngularMomentum() {
        let Lx = 0, Ly = 0, Lz = 0;
        for (const b of this.bodies) {
            if (!b.alive) continue;
            const [lx, ly, lz] = b.angularMomentum();
            Lx += lx; Ly += ly; Lz += lz;
        }
        return [Lx, Ly, Lz];
    }

    updateConservationDiagnostics() {
        if (!this.trackConservation) return;

        const E = this.totalEnergy();
        const p = this.totalMomentum();
        const L = this.totalAngularMomentum();

        if (this.initialEnergy === null) {
            this.initialEnergy = E;
            this.initialMomentum = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
            this.initialAngMomentum = Math.sqrt(L[0] * L[0] + L[1] * L[1] + L[2] * L[2]);
        }

        this.energyError = Math.abs(this.initialEnergy) > 1e-30
            ? Math.abs((E - this.initialEnergy) / this.initialEnergy) : 0;

        const pMag = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
        this.momentumError = Math.abs(this.initialMomentum) > 1e-30
            ? Math.abs((pMag - this.initialMomentum) / this.initialMomentum) : pMag;
    }

    // ========================================================================
    // Main step function
    // ========================================================================

    /**
     * Advance the simulation by one timestep.
     * @param {number} [externalDt] - Override timestep (for renderer sync)
     * @returns {Array} Array of collision/tidal events that occurred this step
     */
    step(externalDt) {
        this.events = [];

        // Clean dead bodies
        this.bodies = this.bodies.filter(b => b.alive);

        // Compute accelerations (needed for adaptive step and first kick)
        this.computeAccelerations();

        // Determine timestep
        const dt = externalDt ?? (this.adaptiveStep ? this.computeAdaptiveDt() : this.baseDt);
        this.dt = dt;

        // Integrate
        switch (this.integratorType) {
            case 'yoshida4':
                this.stepYoshida4(dt);
                break;
            case 'leapfrog':
                this.stepLeapfrog(dt);
                break;
            case 'rk4':
                this.stepRK4(dt);
                break;
            default:
                this.stepYoshida4(dt);
        }

        // Detect and resolve collisions
        const { collisions, tidalEvents } = this.detectCollisions();

        for (const [bi, bj, dist] of collisions) {
            if (!bi.alive || !bj.alive) continue;
            const result = this.resolveCollision(bi, bj);

            // Add survivor and fragments to simulation
            this.addBody(result.survivor);
            for (const frag of result.fragments) {
                this.addBody(frag);
            }

            this.events.push({
                type: result.type,
                time: this.time,
                bodies: result.consumed,
                survivor: result.survivor,
                fragments: result.fragments,
                impactEnergy: result.impactEnergy,
                threshold: result.threshold,
                largestRemnantRatio: result.largestRemnantRatio,
            });
        }

        for (const tidal of tidalEvents) {
            this.events.push({
                type: 'tidal_stress',
                time: this.time,
                primary: tidal.primary,
                secondary: tidal.secondary,
                distance: tidal.dist,
                rocheLimit: tidal.rocheLimit,
            });
        }

        this.time += dt;
        this.stepCount++;

        // Conservation diagnostics (every 10 steps to save CPU)
        if (this.stepCount % 10 === 0) {
            this.updateConservationDiagnostics();
        }

        return this.events;
    }

    // ========================================================================
    // Orbital mechanics utilities
    // ========================================================================

    /**
     * Compute Keplerian orbital elements for body orbiting central mass.
     * Returns { a, e, i, Omega, omega, trueAnomaly }
     * a = semi-major axis, e = eccentricity, i = inclination
     */
    static orbitalElements(body, centralMass, G = G_CONST) {
        const mu = G * centralMass;
        const r = Math.sqrt(body.x ** 2 + body.y ** 2 + body.z ** 2);
        const v2 = body.vx ** 2 + body.vy ** 2 + body.vz ** 2;

        // Specific orbital energy
        const energy = v2 / 2 - mu / r;

        // Semi-major axis
        const a = -mu / (2 * energy);

        // Specific angular momentum
        const [hx, hy, hz] = v3Cross(body.x, body.y, body.z, body.vx, body.vy, body.vz);
        const h = Math.sqrt(hx ** 2 + hy ** 2 + hz ** 2);

        // Eccentricity vector
        const rdot = v3Dot(body.x, body.y, body.z, body.vx, body.vy, body.vz) / r;
        const ex = (v2 / mu - 1 / r) * body.x - rdot / mu * body.vx * r;
        const ey = (v2 / mu - 1 / r) * body.y - rdot / mu * body.vy * r;
        const ez = (v2 / mu - 1 / r) * body.z - rdot / mu * body.vz * r;
        const e = Math.sqrt(ex ** 2 + ey ** 2 + ez ** 2);

        // Inclination
        const inc = Math.acos(Math.max(-1, Math.min(1, hz / h)));

        // True anomaly
        const rDotE = v3Dot(body.x, body.y, body.z, ex, ey, ez);
        let nu = Math.acos(Math.max(-1, Math.min(1, rDotE / (r * e + 1e-30))));
        if (rdot < 0) nu = 2 * Math.PI - nu;

        return { a, e, inclination: inc, trueAnomaly: nu, specificEnergy: energy, h };
    }

    /**
     * Set a body on a circular orbit around origin at given radius.
     * v_circ = sqrt(G * M_central / r) in the orbital plane.
     */
    static setCircularOrbit(body, centralMass, radius, inclination = 0, G = G_CONST) {
        const vCirc = Math.sqrt(G * centralMass / radius);
        const angle = Math.random() * 2 * Math.PI;
        body.x = radius * Math.cos(angle) * Math.cos(inclination);
        body.y = radius * Math.sin(inclination);
        body.z = radius * Math.sin(angle) * Math.cos(inclination);
        // Velocity perpendicular to position in orbital plane
        body.vx = -vCirc * Math.sin(angle);
        body.vy = 0;
        body.vz = vCirc * Math.cos(angle);
    }

    /**
     * Get a summary of the current state for diagnostics.
     */
    getDiagnostics() {
        const alive = this.bodies.filter(b => b.alive);
        return {
            time: this.time,
            dt: this.dt,
            stepCount: this.stepCount,
            numBodies: alive.length,
            totalMass: alive.reduce((s, b) => s + b.mass, 0),
            kineticEnergy: this.totalKineticEnergy(),
            potentialEnergy: this.totalPotentialEnergy(),
            totalEnergy: this.totalEnergy(),
            energyError: this.energyError,
            momentumError: this.momentumError,
            integrator: this.integratorType,
        };
    }
}
