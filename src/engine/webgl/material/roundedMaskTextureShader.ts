export const fsRoundedMaskTexture = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_sampler;
uniform float u_alpha;
uniform vec2 u_maskSize;        // Parent rect size (mask bounds)
uniform vec2 u_imageSize;       // Image rect size
uniform vec2 u_offset;          // Image center offset from parent center
uniform float u_radius;

out vec4 outColor;

float sdRoundRect(vec2 p, vec2 b, float r) {
  // Signed distance to rounded rect centered at origin.
  // b: half-size.
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec4 tex = texture(u_sampler, v_uv);
  
  // Calculate position in parent rect's coordinate system
  // v_uv is in 0-1 range for the image rect
  // Convert to image-local coordinates (centered at image center)
  vec2 imageLocal = (v_uv - 0.5) * u_imageSize;
  
  // Add offset to get position relative to parent center
  vec2 parentLocal = imageLocal + u_offset;
  
  // Calculate mask using parent rect's size and radius
  vec2 maskSize = max(u_maskSize, vec2(1.0));
  float r = max(0.0, min(u_radius, 0.5 * min(maskSize.x, maskSize.y)));
  
  float d = sdRoundRect(parentLocal, maskSize * 0.5, r);
  float aa = max(1e-4, fwidth(d));
  float mask = 1.0 - smoothstep(0.0, aa, d);
  
  // Apply mask to texture alpha
  outColor = vec4(tex.rgb, tex.a * mask * u_alpha);
}
`
