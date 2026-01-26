// =============================================================================
// Particle Rendering Shader for UE5 Niagara
// =============================================================================
//
// Custom material functions for rendering galaxy particles with:
// - Soft glow effects
// - Distance-based sizing
// - Velocity-based color variation
// - Bloom-friendly emission
//
// Use these in Niagara Sprite Renderer or Mesh Renderer materials
// =============================================================================

// -----------------------------------------------------------------------------
// Material Function: Galaxy Particle Color
// -----------------------------------------------------------------------------
// Input: ParticleColor (float4), ParticleVelocity (float3), DistanceFromCenter (float)
// Output: Final emissive color for the particle

float4 MF_GalaxyParticleColor(
    float4 BaseColor,
    float3 Velocity,
    float DistanceFromCenter,
    float GalaxyRadius,
    float EmissiveIntensity,
    float4 CoreColor,
    float4 DiskColor,
    float4 HaloColor
)
{
    // Normalize distance
    float normalizedDist = saturate(DistanceFromCenter / GalaxyRadius);

    // Three-zone color blending: Core -> Disk -> Halo
    float4 zoneColor;
    if (normalizedDist < 0.2)
    {
        // Core region - bright, hot
        float t = normalizedDist / 0.2;
        zoneColor = lerp(CoreColor, DiskColor, t);
    }
    else if (normalizedDist < 0.7)
    {
        // Disk region - main galaxy body
        float t = (normalizedDist - 0.2) / 0.5;
        zoneColor = lerp(DiskColor, HaloColor, t * 0.5);
    }
    else
    {
        // Halo region - fading outer stars
        float t = (normalizedDist - 0.7) / 0.3;
        zoneColor = lerp(HaloColor, float4(0.1, 0.1, 0.2, 0.3), t);
    }

    // Velocity-based brightness boost (fast-moving stars appear brighter)
    float speed = length(Velocity);
    float speedFactor = 1.0 + saturate(speed * 0.1) * 0.5;

    // Combine with base color
    float4 finalColor = BaseColor * zoneColor * speedFactor;

    // Apply emissive intensity for bloom
    finalColor.rgb *= EmissiveIntensity;

    return finalColor;
}

// -----------------------------------------------------------------------------
// Material Function: Soft Particle Sprite
// -----------------------------------------------------------------------------
// Creates a soft, glowing circular particle

float4 MF_SoftParticleSprite(
    float2 UV,
    float4 ParticleColor,
    float Softness,
    float CoreBrightness
)
{
    // Distance from center of sprite
    float2 centered = UV - 0.5;
    float dist = length(centered) * 2.0; // Normalize to 0-1 at edges

    // Soft falloff
    float alpha = 1.0 - smoothstep(0.0, 1.0, dist);
    alpha = pow(alpha, Softness);

    // Bright core
    float core = exp(-dist * dist * 8.0) * CoreBrightness;

    // Final color with glow
    float4 result;
    result.rgb = ParticleColor.rgb * (alpha + core);
    result.a = alpha * ParticleColor.a;

    return result;
}

// -----------------------------------------------------------------------------
// Material Function: Star Twinkle
// -----------------------------------------------------------------------------
// Adds subtle twinkling effect based on time and particle ID

float MF_StarTwinkle(
    float Time,
    float ParticleID,
    float TwinkleSpeed,
    float TwinkleAmount
)
{
    // Pseudo-random phase offset per particle
    float phase = frac(ParticleID * 0.123456) * 6.28318;

    // Multiple frequency twinkling for natural look
    float twinkle1 = sin(Time * TwinkleSpeed + phase) * 0.5 + 0.5;
    float twinkle2 = sin(Time * TwinkleSpeed * 1.7 + phase * 2.3) * 0.5 + 0.5;

    // Combine and scale
    float twinkle = lerp(twinkle1, twinkle2, 0.3);
    return 1.0 + twinkle * TwinkleAmount;
}

// -----------------------------------------------------------------------------
// Material Function: Dust Lane Effect
// -----------------------------------------------------------------------------
// Simulates dust lanes in spiral galaxies (darken certain regions)

float MF_DustLaneEffect(
    float3 WorldPosition,
    float GalaxyRadius,
    float NumSpirals,
    float DustIntensity,
    float SpiralTightness
)
{
    // Convert to cylindrical coordinates
    float r = length(WorldPosition.xy);
    float theta = atan2(WorldPosition.y, WorldPosition.x);

    // Spiral pattern
    float spiral = sin(theta * NumSpirals - r * SpiralTightness);

    // Dust is concentrated in spiral arms
    float dust = saturate(spiral * 0.5 + 0.5);
    dust = pow(dust, 2.0);

    // Dust diminishes toward center and edge
    float radialFade = saturate(r / GalaxyRadius);
    radialFade = radialFade * (1.0 - radialFade) * 4.0;

    // Height falloff (dust is in the disk plane)
    float heightFade = exp(-abs(WorldPosition.z) * 5.0);

    return 1.0 - dust * DustIntensity * radialFade * heightFade;
}

// -----------------------------------------------------------------------------
// Vertex Shader Modifications for Niagara
// -----------------------------------------------------------------------------

struct VS_GalaxyParticle_Input
{
    float3 Position : POSITION;
    float3 Velocity : TEXCOORD0;
    float4 Color : COLOR0;
    float Size : TEXCOORD1;
    float Age : TEXCOORD2;
    uint ParticleID : SV_InstanceID;
};

struct VS_GalaxyParticle_Output
{
    float4 Position : SV_POSITION;
    float4 Color : COLOR0;
    float2 UV : TEXCOORD0;
    float3 WorldPosition : TEXCOORD1;
    float Size : TEXCOORD2;
};

// Custom vertex shader for galaxy particles
// (Use in Custom Expression or Material Custom Node)
/*
VS_GalaxyParticle_Output VS_GalaxyParticle(VS_GalaxyParticle_Input Input)
{
    VS_GalaxyParticle_Output Output;

    // Transform position
    Output.WorldPosition = Input.Position;
    Output.Position = mul(float4(Input.Position, 1.0), ViewProjection);

    // Pass through color with velocity-based modification
    float speed = length(Input.Velocity);
    float speedBoost = 1.0 + saturate(speed * 0.05) * 0.3;
    Output.Color = Input.Color * speedBoost;

    // Size variation based on distance (perspective already handled by engine)
    Output.Size = Input.Size;

    // UV for sprite rendering
    Output.UV = float2(0, 0); // Set by geometry shader or sprite renderer

    return Output;
}
*/

// -----------------------------------------------------------------------------
// Niagara Module Script: Update Particle Size
// -----------------------------------------------------------------------------
// HLSL for dynamic particle sizing based on distance and mass

float CalculateParticleSize(
    float BaseSizeMin,
    float BaseSizeMax,
    float Mass,
    float MaxMass,
    float DistanceFromCamera,
    float NearDistance,
    float FarDistance
)
{
    // Mass-based size (larger mass = larger particle)
    float massRatio = saturate(Mass / MaxMass);
    float baseSize = lerp(BaseSizeMin, BaseSizeMax, sqrt(massRatio));

    // Distance-based scaling (maintain visual size)
    float distFactor = saturate((DistanceFromCamera - NearDistance) / (FarDistance - NearDistance));
    float distScale = lerp(1.0, 2.0, distFactor);

    return baseSize * distScale;
}
