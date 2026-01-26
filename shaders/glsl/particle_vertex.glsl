#version 330 core

layout(location = 0) in vec3 in_position;
layout(location = 1) in vec3 in_color;

uniform mat4 view_projection;
uniform float point_size;
uniform float max_radius;

out vec3 frag_color;
out float frag_depth;

void main() {
    gl_Position = view_projection * vec4(in_position, 1.0);

    // Calculate distance from origin for size variation
    float dist = length(in_position.xy);
    float size_factor = 1.0 + 0.5 * (1.0 - dist / max_radius);

    // Point size decreases with depth (perspective)
    float depth_factor = 1.0 / (1.0 + gl_Position.z * 0.1);
    gl_PointSize = point_size * size_factor * depth_factor;

    frag_color = in_color;
    frag_depth = gl_Position.z / gl_Position.w;
}
