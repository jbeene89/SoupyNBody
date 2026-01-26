#version 330 core

in vec3 frag_color;
in float frag_depth;

out vec4 out_color;

void main() {
    // Create soft circular particle
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);

    // Discard pixels outside the circle
    if (dist > 0.5) {
        discard;
    }

    // Soft falloff for glow effect
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha = pow(alpha, 1.5);

    // Depth-based brightness (closer particles are brighter)
    float depth_brightness = 1.0 - frag_depth * 0.3;
    depth_brightness = clamp(depth_brightness, 0.5, 1.0);

    // Apply color with soft glow
    vec3 color = frag_color * depth_brightness;

    // Add slight bloom at center
    float bloom = exp(-dist * 8.0) * 0.3;
    color += vec3(bloom);

    out_color = vec4(color, alpha);
}
