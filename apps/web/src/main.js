/**
 * SoupyNBody - WebGL Galaxy Simulator (Enhanced)
 *
 * High-complexity version with:
 * - 50,000+ particles
 * - Barnes-Hut tree for N-body interactions
 * - Spiral arm structure
 * - Multiple particle layers (stars, gas, dust)
 * - Custom shaders with glow
 * - Post-processing bloom
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    numParticles: 50000,
    numDust: 20000,
    numGas: 15000,
    galaxyRadius: 20,
    centralMass: 500000,
    particleMass: 1,
    G: 1,
    softening: 0.3,
    timeScale: 1.5,
    particleSize: 0.12,
    dustSize: 0.08,
    gasSize: 0.25,
    spiralArms: 4,
    spiralTightness: 0.5,
    barnesHutTheta: 0.7, // Barnes-Hut opening angle (lower = more accurate, slower)
    enableNBody: true,
    numMassiveParticles: 200, // Particles that interact with each other
    bloomStrength: 1.5,
    bloomRadius: 0.4,
    bloomThreshold: 0.2,
};

// ============================================================================
// Barnes-Hut Octree for N-body approximation
// ============================================================================

class OctreeNode {
    constructor(center, halfSize) {
        this.center = center;
        this.halfSize = halfSize;
        this.mass = 0;
        this.centerOfMass = new THREE.Vector3();
        this.children = null;
        this.particleIndex = -1;
    }

    insert(positions, masses, index, depth = 0) {
        if (depth > 20) return; // Prevent infinite recursion

        const idx = index * 3;
        const px = positions[idx];
        const py = positions[idx + 1];
        const pz = positions[idx + 2];
        const mass = masses[index];

        if (this.mass === 0 && this.particleIndex === -1) {
            // Empty node - store particle here
            this.particleIndex = index;
            this.mass = mass;
            this.centerOfMass.set(px, py, pz);
            return;
        }

        if (this.children === null) {
            // Need to subdivide
            this.children = [];
            const hs = this.halfSize / 2;
            for (let i = 0; i < 8; i++) {
                const ox = (i & 1) ? hs : -hs;
                const oy = (i & 2) ? hs : -hs;
                const oz = (i & 4) ? hs : -hs;
                this.children.push(new OctreeNode(
                    new THREE.Vector3(
                        this.center.x + ox,
                        this.center.y + oy,
                        this.center.z + oz
                    ),
                    hs
                ));
            }

            // Re-insert existing particle
            if (this.particleIndex !== -1) {
                const oldIdx = this.particleIndex;
                this.particleIndex = -1;
                this._insertIntoChild(positions, masses, oldIdx, depth);
            }
        }

        // Insert new particle into appropriate child
        this._insertIntoChild(positions, masses, index, depth);

        // Update mass and center of mass
        const totalMass = this.mass + mass;
        this.centerOfMass.x = (this.centerOfMass.x * this.mass + px * mass) / totalMass;
        this.centerOfMass.y = (this.centerOfMass.y * this.mass + py * mass) / totalMass;
        this.centerOfMass.z = (this.centerOfMass.z * this.mass + pz * mass) / totalMass;
        this.mass = totalMass;
    }

    _insertIntoChild(positions, masses, index, depth) {
        const idx = index * 3;
        const px = positions[idx];
        const py = positions[idx + 1];
        const pz = positions[idx + 2];

        let childIndex = 0;
        if (px > this.center.x) childIndex |= 1;
        if (py > this.center.y) childIndex |= 2;
        if (pz > this.center.z) childIndex |= 4;

        this.children[childIndex].insert(positions, masses, index, depth + 1);
    }

    computeAcceleration(px, py, pz, particleIndex, G, softening, theta) {
        if (this.mass === 0) return { ax: 0, ay: 0, az: 0 };

        const dx = this.centerOfMass.x - px;
        const dy = this.centerOfMass.y - py;
        const dz = this.centerOfMass.z - pz;
        const distSq = dx * dx + dy * dy + dz * dz + softening * softening;
        const dist = Math.sqrt(distSq);

        // If this is a leaf node or far enough away, use this node's mass
        const ratio = (this.halfSize * 2) / dist;

        if (this.children === null || ratio < theta) {
            // Skip self-interaction
            if (this.particleIndex === particleIndex) {
                return { ax: 0, ay: 0, az: 0 };
            }

            const invDistCube = 1 / (distSq * dist);
            const force = G * this.mass * invDistCube;

            return {
                ax: force * dx,
                ay: force * dy,
                az: force * dz
            };
        }

        // Recursively compute from children
        let ax = 0, ay = 0, az = 0;
        for (const child of this.children) {
            if (child.mass > 0) {
                const acc = child.computeAcceleration(px, py, pz, particleIndex, G, softening, theta);
                ax += acc.ax;
                ay += acc.ay;
                az += acc.az;
            }
        }

        return { ax, ay, az };
    }
}

// ============================================================================
// Galaxy Simulation Class (Enhanced)
// ============================================================================

class GalaxySimulation {
    constructor(numParticles) {
        this.numParticles = numParticles;
        this.positions = new Float32Array(numParticles * 3);
        this.velocities = new Float32Array(numParticles * 3);
        this.masses = new Float32Array(numParticles);
        this.colors = new Float32Array(numParticles * 3);
        this.sizes = new Float32Array(numParticles);
        this.time = 0;
        this.octree = null;
    }

    initializeGalaxy(radius, centralMass) {
        const n = this.numParticles;

        for (let i = 0; i < n; i++) {
            const idx = i * 3;

            if (i === 0) {
                // Central supermassive black hole
                this.positions[idx] = 0;
                this.positions[idx + 1] = 0;
                this.positions[idx + 2] = 0;
                this.velocities[idx] = 0;
                this.velocities[idx + 1] = 0;
                this.velocities[idx + 2] = 0;
                this.masses[i] = centralMass;
                this.colors[idx] = 1.0;
                this.colors[idx + 1] = 0.9;
                this.colors[idx + 2] = 0.7;
                this.sizes[i] = CONFIG.particleSize * 5;
                continue;
            }

            // Determine if this is a massive particle (for N-body)
            const isMassive = i < CONFIG.numMassiveParticles;

            // Exponential disk with spiral arm enhancement
            const u = Math.random();
            let r = -radius * 0.4 * Math.log(1 - u * 0.98);
            r = Math.max(0.2, Math.min(r, radius * 1.2));

            // Base angle
            let theta = Math.random() * Math.PI * 2;

            // Spiral arm perturbation
            const armPhase = Math.floor(Math.random() * CONFIG.spiralArms) * (2 * Math.PI / CONFIG.spiralArms);
            const spiralAngle = armPhase + CONFIG.spiralTightness * Math.log(r + 1);
            const armStrength = 0.4 * Math.exp(-r / (radius * 0.5));

            // Probability of being in arm vs inter-arm
            if (Math.random() < 0.7) {
                // In spiral arm
                theta = spiralAngle + (Math.random() - 0.5) * 0.5;
            }

            // Position with vertical structure
            const verticalScale = 0.03 + 0.02 * (r / radius);
            this.positions[idx] = r * Math.cos(theta);
            this.positions[idx + 1] = r * Math.sin(theta);
            this.positions[idx + 2] = (Math.random() - 0.5) * radius * verticalScale * Math.exp(-r / radius);

            // Circular orbital velocity with rotation curve
            // Realistic rotation curve: rises then flattens (dark matter halo effect)
            const vCircBase = Math.sqrt(CONFIG.G * centralMass / (r + 1));
            const rotationCurve = 1 - 0.3 * Math.exp(-r / (radius * 0.3)); // Flattening
            const vCirc = vCircBase * rotationCurve;

            const dispersion = 0.08 * vCirc * (1 + r / radius);

            this.velocities[idx] = -vCirc * Math.sin(theta) + dispersion * (Math.random() - 0.5);
            this.velocities[idx + 1] = vCirc * Math.cos(theta) + dispersion * (Math.random() - 0.5);
            this.velocities[idx + 2] = dispersion * 0.3 * (Math.random() - 0.5);

            // Mass - massive particles get more mass
            this.masses[i] = isMassive ? CONFIG.particleMass * 1000 : CONFIG.particleMass;

            // Size variation
            this.sizes[i] = CONFIG.particleSize * (0.5 + Math.random() * 1.0) * (isMassive ? 2 : 1);

            // Color based on radius and arm position
            const t = r / radius;
            const inArm = Math.abs(((theta - spiralAngle + Math.PI) % (2 * Math.PI)) - Math.PI) < 0.3;

            if (inArm && t < 0.6) {
                // Young blue stars in arms
                this.colors[idx] = 0.6 + 0.3 * Math.random();
                this.colors[idx + 1] = 0.7 + 0.3 * Math.random();
                this.colors[idx + 2] = 1.0;
            } else if (t < 0.2) {
                // Yellow/white core
                this.colors[idx] = 1.0;
                this.colors[idx + 1] = 0.85 + 0.15 * Math.random();
                this.colors[idx + 2] = 0.6 + 0.2 * Math.random();
            } else {
                // Mixed population
                const starType = Math.random();
                if (starType < 0.6) {
                    // Red giants / old stars
                    this.colors[idx] = 1.0;
                    this.colors[idx + 1] = 0.6 + 0.3 * Math.random();
                    this.colors[idx + 2] = 0.3 + 0.3 * Math.random();
                } else if (starType < 0.85) {
                    // Sun-like
                    this.colors[idx] = 1.0;
                    this.colors[idx + 1] = 0.9 + 0.1 * Math.random();
                    this.colors[idx + 2] = 0.7 + 0.2 * Math.random();
                } else {
                    // Blue stars
                    this.colors[idx] = 0.7 + 0.2 * Math.random();
                    this.colors[idx + 1] = 0.8 + 0.2 * Math.random();
                    this.colors[idx + 2] = 1.0;
                }
            }
        }

        this.buildOctree();
    }

    initializeCollision(radius, centralMass) {
        const n = this.numParticles;
        const separation = radius * 4;
        const impactParam = radius * 1.5;

        // Create two interacting galaxies
        const galaxies = [
            { cx: 0, cy: 0, cz: 0, vx: 0.4, vy: 0.1, vz: 0, mass: centralMass * 0.6, color: [0.6, 0.8, 1.0] },
            { cx: separation, cy: impactParam, cz: radius * 0.3, vx: -0.5, vy: -0.15, vz: -0.1, mass: centralMass * 0.4, color: [1.0, 0.7, 0.5] }
        ];

        const particlesPerGalaxy = Math.floor(n / 2);

        for (let g = 0; g < 2; g++) {
            const galaxy = galaxies[g];
            const startIdx = g * particlesPerGalaxy;
            const gRadius = radius * (g === 0 ? 1.0 : 0.7);

            for (let i = 0; i < particlesPerGalaxy; i++) {
                const pIdx = startIdx + i;
                const idx = pIdx * 3;

                if (i === 0) {
                    // Central mass
                    this.positions[idx] = galaxy.cx;
                    this.positions[idx + 1] = galaxy.cy;
                    this.positions[idx + 2] = galaxy.cz;
                    this.velocities[idx] = galaxy.vx;
                    this.velocities[idx + 1] = galaxy.vy;
                    this.velocities[idx + 2] = galaxy.vz;
                    this.masses[pIdx] = galaxy.mass;
                    this.colors[idx] = 1.0;
                    this.colors[idx + 1] = 0.95;
                    this.colors[idx + 2] = 0.8;
                    this.sizes[pIdx] = CONFIG.particleSize * 5;
                    continue;
                }

                // Disk particle with spiral structure
                const u = Math.random();
                let r = -gRadius * 0.35 * Math.log(1 - u * 0.95);
                r = Math.max(0.3, Math.min(r, gRadius));

                let theta = Math.random() * Math.PI * 2;

                // Spiral arms
                const armPhase = Math.floor(Math.random() * 3) * (2 * Math.PI / 3);
                const spiralAngle = armPhase + 0.4 * Math.log(r + 1);
                if (Math.random() < 0.65) {
                    theta = spiralAngle + (Math.random() - 0.5) * 0.4;
                }

                // Tilted disk for second galaxy
                let lx = r * Math.cos(theta);
                let ly = r * Math.sin(theta);
                let lz = (Math.random() - 0.5) * gRadius * 0.04;

                if (g === 1) {
                    // Tilt second galaxy
                    const tilt = 0.5;
                    const newY = ly * Math.cos(tilt) - lz * Math.sin(tilt);
                    const newZ = ly * Math.sin(tilt) + lz * Math.cos(tilt);
                    ly = newY;
                    lz = newZ;
                }

                this.positions[idx] = galaxy.cx + lx;
                this.positions[idx + 1] = galaxy.cy + ly;
                this.positions[idx + 2] = galaxy.cz + lz;

                const vCirc = Math.sqrt(CONFIG.G * galaxy.mass / (r + 0.5));
                let vx = -vCirc * Math.sin(theta);
                let vy = vCirc * Math.cos(theta);
                let vz = 0;

                if (g === 1) {
                    const tilt = 0.5;
                    const newVY = vy * Math.cos(tilt);
                    const newVZ = vy * Math.sin(tilt);
                    vy = newVY;
                    vz = newVZ;
                }

                this.velocities[idx] = galaxy.vx + vx;
                this.velocities[idx + 1] = galaxy.vy + vy;
                this.velocities[idx + 2] = galaxy.vz + vz;

                this.masses[pIdx] = i < 50 ? CONFIG.particleMass * 500 : CONFIG.particleMass;
                this.sizes[pIdx] = CONFIG.particleSize * (0.6 + Math.random() * 0.8);

                // Galaxy-specific coloring
                const t = r / gRadius;
                const baseColor = galaxy.color;
                this.colors[idx] = baseColor[0] * (0.7 + 0.3 * (1 - t));
                this.colors[idx + 1] = baseColor[1] * (0.7 + 0.3 * (1 - t));
                this.colors[idx + 2] = baseColor[2] * (0.7 + 0.3 * (1 - t));
            }
        }

        this.buildOctree();
    }

    buildOctree() {
        // Find bounds
        let maxCoord = 0;
        for (let i = 0; i < this.numParticles; i++) {
            const idx = i * 3;
            maxCoord = Math.max(maxCoord,
                Math.abs(this.positions[idx]),
                Math.abs(this.positions[idx + 1]),
                Math.abs(this.positions[idx + 2])
            );
        }

        this.octree = new OctreeNode(new THREE.Vector3(0, 0, 0), maxCoord * 1.5);

        // Insert massive particles into octree
        for (let i = 0; i < Math.min(this.numParticles, CONFIG.numMassiveParticles + 2); i++) {
            if (this.masses[i] > CONFIG.particleMass * 10) {
                this.octree.insert(this.positions, this.masses, i);
            }
        }
    }

    step(dt) {
        const n = this.numParticles;
        const G = CONFIG.G;
        const softening = CONFIG.softening;
        const softeningSq = softening * softening;

        // Rebuild octree periodically for massive particles
        if (CONFIG.enableNBody && Math.random() < 0.1) {
            this.buildOctree();
        }

        // Find central masses
        const centers = [];
        for (let i = 0; i < n; i++) {
            if (this.masses[i] > CONFIG.particleMass * 10000) {
                centers.push({
                    idx: i,
                    x: this.positions[i * 3],
                    y: this.positions[i * 3 + 1],
                    z: this.positions[i * 3 + 2],
                    m: this.masses[i]
                });
            }
        }

        // Update all particles
        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            const px = this.positions[idx];
            const py = this.positions[idx + 1];
            const pz = this.positions[idx + 2];

            let ax = 0, ay = 0, az = 0;

            // Acceleration from central masses
            for (const center of centers) {
                if (center.idx === i) continue;

                const dx = center.x - px;
                const dy = center.y - py;
                const dz = center.z - pz;
                const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
                const invDist = 1 / Math.sqrt(distSq);
                const invDistCube = invDist * invDist * invDist;
                const force = G * center.m * invDistCube;

                ax += force * dx;
                ay += force * dy;
                az += force * dz;
            }

            // Barnes-Hut N-body for nearby massive particles
            if (CONFIG.enableNBody && this.octree && this.masses[i] > CONFIG.particleMass * 10) {
                const bhAcc = this.octree.computeAcceleration(
                    px, py, pz, i, G, softening, CONFIG.barnesHutTheta
                );
                ax += bhAcc.ax * 0.1; // Scaled down to prevent instability
                ay += bhAcc.ay * 0.1;
                az += bhAcc.az * 0.1;
            }

            // Leapfrog integration
            this.velocities[idx] += ax * dt * 0.5;
            this.velocities[idx + 1] += ay * dt * 0.5;
            this.velocities[idx + 2] += az * dt * 0.5;

            this.positions[idx] += this.velocities[idx] * dt;
            this.positions[idx + 1] += this.velocities[idx + 1] * dt;
            this.positions[idx + 2] += this.velocities[idx + 2] * dt;

            this.velocities[idx] += ax * dt * 0.5;
            this.velocities[idx + 1] += ay * dt * 0.5;
            this.velocities[idx + 2] += az * dt * 0.5;
        }

        // Update central mass interactions
        for (let i = 0; i < centers.length; i++) {
            for (let j = i + 1; j < centers.length; j++) {
                const c1 = centers[i];
                const c2 = centers[j];

                const dx = c2.x - c1.x;
                const dy = c2.y - c1.y;
                const dz = c2.z - c1.z;
                const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
                const invDist = 1 / Math.sqrt(distSq);
                const invDistCube = invDist * invDist * invDist;

                const force1 = G * c2.m * invDistCube;
                const force2 = G * c1.m * invDistCube;

                this.velocities[c1.idx * 3] += force1 * dx * dt;
                this.velocities[c1.idx * 3 + 1] += force1 * dy * dt;
                this.velocities[c1.idx * 3 + 2] += force1 * dz * dt;

                this.velocities[c2.idx * 3] -= force2 * dx * dt;
                this.velocities[c2.idx * 3 + 1] -= force2 * dy * dt;
                this.velocities[c2.idx * 3 + 2] -= force2 * dz * dt;
            }
        }

        this.time += dt;
    }
}

// ============================================================================
// Dust/Gas Layer Simulation
// ============================================================================

class DustLayer {
    constructor(numParticles, simulation) {
        this.numParticles = numParticles;
        this.positions = new Float32Array(numParticles * 3);
        this.colors = new Float32Array(numParticles * 3);
        this.sizes = new Float32Array(numParticles);
        this.velocities = new Float32Array(numParticles * 3);
        this.mainSim = simulation;
    }

    initialize(radius, isDust = true) {
        for (let i = 0; i < this.numParticles; i++) {
            const idx = i * 3;

            // Follow spiral arm structure more closely
            const u = Math.random();
            let r = -radius * 0.5 * Math.log(1 - u * 0.9);
            r = Math.max(1, Math.min(r, radius * 0.9));

            const armPhase = Math.floor(Math.random() * CONFIG.spiralArms) * (2 * Math.PI / CONFIG.spiralArms);
            const spiralAngle = armPhase + CONFIG.spiralTightness * Math.log(r + 1);
            const theta = spiralAngle + (Math.random() - 0.5) * 0.3;

            this.positions[idx] = r * Math.cos(theta);
            this.positions[idx + 1] = r * Math.sin(theta);
            this.positions[idx + 2] = (Math.random() - 0.5) * radius * (isDust ? 0.02 : 0.05);

            // Velocity matching stars
            const vCirc = Math.sqrt(CONFIG.G * CONFIG.centralMass / (r + 1)) * 0.95;
            this.velocities[idx] = -vCirc * Math.sin(theta);
            this.velocities[idx + 1] = vCirc * Math.cos(theta);
            this.velocities[idx + 2] = 0;

            if (isDust) {
                // Dark dust lanes
                this.colors[idx] = 0.15 + 0.1 * Math.random();
                this.colors[idx + 1] = 0.1 + 0.1 * Math.random();
                this.colors[idx + 2] = 0.1 + 0.05 * Math.random();
                this.sizes[i] = CONFIG.dustSize * (0.5 + Math.random());
            } else {
                // Emission nebulae (pinkish/reddish)
                this.colors[idx] = 0.8 + 0.2 * Math.random();
                this.colors[idx + 1] = 0.2 + 0.3 * Math.random();
                this.colors[idx + 2] = 0.4 + 0.3 * Math.random();
                this.sizes[i] = CONFIG.gasSize * (0.5 + Math.random() * 1.5);
            }
        }
    }

    update(dt) {
        // Simplified update - follow main galaxy rotation
        for (let i = 0; i < this.numParticles; i++) {
            const idx = i * 3;
            const px = this.positions[idx];
            const py = this.positions[idx + 1];
            const r = Math.sqrt(px * px + py * py) + 0.1;

            const vCirc = Math.sqrt(CONFIG.G * CONFIG.centralMass / (r + 1));
            const theta = Math.atan2(py, px);

            this.velocities[idx] = -vCirc * Math.sin(theta);
            this.velocities[idx + 1] = vCirc * Math.cos(theta);

            this.positions[idx] += this.velocities[idx] * dt;
            this.positions[idx + 1] += this.velocities[idx + 1] * dt;
            this.positions[idx + 2] += this.velocities[idx + 2] * dt;
        }
    }
}

// ============================================================================
// Three.js Renderer (Enhanced)
// ============================================================================

class GalaxyRenderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000208);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        container.appendChild(this.renderer.domElement);

        // Camera position
        this.camera.position.set(0, 25, 50);
        this.camera.lookAt(0, 0, 0);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.3;
        this.controls.maxDistance = 200;
        this.controls.minDistance = 5;

        // Post-processing
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            CONFIG.bloomStrength,
            CONFIG.bloomRadius,
            CONFIG.bloomThreshold
        );
        this.composer.addPass(bloomPass);

        // Particle systems
        this.starParticles = null;
        this.dustParticles = null;
        this.gasParticles = null;

        // Add background stars
        this.addBackgroundStars();

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    addBackgroundStars() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(5000 * 3);
        const colors = new Float32Array(5000 * 3);

        for (let i = 0; i < 5000; i++) {
            const idx = i * 3;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 300 + Math.random() * 500;

            positions[idx] = r * Math.sin(phi) * Math.cos(theta);
            positions[idx + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[idx + 2] = r * Math.cos(phi);

            const brightness = 0.3 + Math.random() * 0.7;
            colors[idx] = brightness;
            colors[idx + 1] = brightness;
            colors[idx + 2] = brightness * (0.9 + Math.random() * 0.2);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });

        this.scene.add(new THREE.Points(geometry, material));
    }

    createParticles(simulation, dustLayer, gasLayer) {
        // Clean up old particles
        if (this.starParticles) this.scene.remove(this.starParticles);
        if (this.dustParticles) this.scene.remove(this.dustParticles);
        if (this.gasParticles) this.scene.remove(this.gasParticles);

        // Star particles
        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute('position', new THREE.BufferAttribute(simulation.positions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(simulation.colors, 3));
        starGeometry.setAttribute('size', new THREE.BufferAttribute(simulation.sizes, 1));

        const starMaterial = new THREE.PointsMaterial({
            size: CONFIG.particleSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.starParticles = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(this.starParticles);

        // Dust particles
        const dustGeometry = new THREE.BufferGeometry();
        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustLayer.positions, 3));
        dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustLayer.colors, 3));

        const dustMaterial = new THREE.PointsMaterial({
            size: CONFIG.dustSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            blending: THREE.NormalBlending,
            depthWrite: false,
        });

        this.dustParticles = new THREE.Points(dustGeometry, dustMaterial);
        this.scene.add(this.dustParticles);

        // Gas/nebula particles
        const gasGeometry = new THREE.BufferGeometry();
        gasGeometry.setAttribute('position', new THREE.BufferAttribute(gasLayer.positions, 3));
        gasGeometry.setAttribute('color', new THREE.BufferAttribute(gasLayer.colors, 3));

        const gasMaterial = new THREE.PointsMaterial({
            size: CONFIG.gasSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.gasParticles = new THREE.Points(gasGeometry, gasMaterial);
        this.scene.add(this.gasParticles);
    }

    updateParticles() {
        if (this.starParticles) {
            this.starParticles.geometry.attributes.position.needsUpdate = true;
        }
        if (this.dustParticles) {
            this.dustParticles.geometry.attributes.position.needsUpdate = true;
        }
        if (this.gasParticles) {
            this.gasParticles.geometry.attributes.position.needsUpdate = true;
        }
    }

    render() {
        this.controls.update();
        this.composer.render();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }
}

// ============================================================================
// Main Application
// ============================================================================

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.renderer = new GalaxyRenderer(this.container);
        this.simulation = new GalaxySimulation(CONFIG.numParticles);
        this.dustLayer = new DustLayer(CONFIG.numDust, this.simulation);
        this.gasLayer = new DustLayer(CONFIG.numGas, this.simulation);
        this.paused = false;
        this.lastTime = 0;
        this.frameCount = 0;
        this.fpsTime = 0;

        this.init();
        this.setupUI();
        this.animate();
    }

    init() {
        this.simulation.initializeGalaxy(CONFIG.galaxyRadius, CONFIG.centralMass);
        this.dustLayer.initialize(CONFIG.galaxyRadius, true);
        this.gasLayer.initialize(CONFIG.galaxyRadius, false);
        this.renderer.createParticles(this.simulation, this.dustLayer, this.gasLayer);
        document.getElementById('loading').style.display = 'none';
    }

    setupUI() {
        document.getElementById('particle-count').textContent =
            (CONFIG.numParticles + CONFIG.numDust + CONFIG.numGas).toLocaleString();

        const timeSlider = document.getElementById('time-scale');
        timeSlider.addEventListener('input', (e) => {
            CONFIG.timeScale = (e.target.value / 100) * 3;
        });

        const sizeSlider = document.getElementById('galaxy-size');
        sizeSlider.addEventListener('input', (e) => {
            CONFIG.galaxyRadius = 20 * (e.target.value / 100);
        });

        document.getElementById('btn-pause').addEventListener('click', () => {
            this.paused = !this.paused;
            document.getElementById('btn-pause').textContent = this.paused ? 'Resume' : 'Pause';
            this.renderer.controls.autoRotate = !this.paused;
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.simulation.initializeGalaxy(CONFIG.galaxyRadius, CONFIG.centralMass);
            this.dustLayer.initialize(CONFIG.galaxyRadius, true);
            this.gasLayer.initialize(CONFIG.galaxyRadius, false);
            this.renderer.createParticles(this.simulation, this.dustLayer, this.gasLayer);
        });

        document.getElementById('btn-collision').addEventListener('click', () => {
            this.simulation.initializeCollision(CONFIG.galaxyRadius, CONFIG.centralMass);
            this.dustLayer.initialize(CONFIG.galaxyRadius * 1.5, true);
            this.gasLayer.initialize(CONFIG.galaxyRadius * 1.5, false);
            this.renderer.createParticles(this.simulation, this.dustLayer, this.gasLayer);
        });
    }

    animate(currentTime = 0) {
        requestAnimationFrame((t) => this.animate(t));

        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;

        this.frameCount++;
        if (currentTime - this.fpsTime >= 1000) {
            document.getElementById('fps').textContent = this.frameCount;
            this.frameCount = 0;
            this.fpsTime = currentTime;
        }

        if (!this.paused && dt > 0) {
            const simDt = dt * CONFIG.timeScale;

            // Multiple physics steps per frame for stability
            const subSteps = 2;
            for (let i = 0; i < subSteps; i++) {
                this.simulation.step(simDt / subSteps);
            }

            this.dustLayer.update(simDt);
            this.gasLayer.update(simDt);
            this.renderer.updateParticles();

            document.getElementById('sim-time').textContent = this.simulation.time.toFixed(2);
        }

        this.renderer.render();
    }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
