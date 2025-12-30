export const fsRoundedRect = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec2 u_size;
uniform float u_radius;
uniform float u_borderWidth;
uniform vec4 u_fillColor;
uniform vec4 u_borderColor;

out vec4 outColor;

float sdRoundRect(vec2 p, vec2 b, float r) {
  // Signed distance to rounded rect centered at origin.
  // b: half-size.
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 size = max(u_size, vec2(1.0));
  vec2 p = (v_uv - 0.5) * size;

  float r = max(0.0, min(u_radius, 0.5 * min(size.x, size.y)));
  float bw = max(0.0, u_borderWidth);

  // Outer shape coverage
  float dOuter = sdRoundRect(p, size * 0.5, r);
  float aaOuter = max(1e-4, fwidth(dOuter));
  float outer = 1.0 - smoothstep(0.0, aaOuter, dOuter);
  if (outer <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  // Inner shape coverage (fill region). When bw=0, inner==outer.
  float inner = outer;
  if (bw > 0.0) {
    vec2 innerHalf = max(vec2(0.0), size * 0.5 - vec2(bw));
    float rInner = max(0.0, r - bw);
    float dInner = sdRoundRect(p, innerHalf, rInner);
    float aaInner = max(1e-4, fwidth(dInner));
    inner = 1.0 - smoothstep(0.0, aaInner, dInner);
  }

  float fillCov = clamp(inner, 0.0, 1.0);
  float borderCov = clamp(outer - inner, 0.0, 1.0);
  float cov = max(1e-6, fillCov + borderCov);

  vec3 rgb = (u_fillColor.rgb * fillCov + u_borderColor.rgb * borderCov) / cov;
  float a = u_fillColor.a * fillCov + u_borderColor.a * borderCov;

  outColor = vec4(rgb, a);
}`
