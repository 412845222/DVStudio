export const vsPostGlowComposite = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main(){
  // Standard GL texture coordinates: v=0 is BOTTOM
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

export const fsPostGlowComposite = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_sampler;
uniform sampler2D u_blur;
uniform vec3 u_glowColor;
uniform float u_intensity;
uniform float u_inner;
uniform float u_knockout;
out vec4 outColor;

void main(){
  // Adobe/Flash-like glow: driven by alpha silhouette, glowColor independent from source RGB.
  vec4 base = texture(u_sampler, v_uv);
  vec4 blur = texture(u_blur, v_uv);
  // Outer glow: prefer a mask-based strength so thin AA edges still produce visible glow.
  float outer = clamp(blur.a * (1.0 - base.a), 0.0, 1.0);
  // Inner glow: keep the classic (base - blur) edge signal.
  float inner = max(0.0, base.a - blur.a);
  float strength = mix(outer, inner, step(0.5, u_inner));

  // Non-linear intensity mapping:
  // For small strength values (common with thin lines), linear gain feels too weak.
  float gain = max(0.0, u_intensity);
  float s = clamp(strength, 0.0, 1.0);
  float a = 1.0 - pow(1.0 - s, gain * 2.5);
  a = clamp(a, 0.0, 1.0);

  // Compose in premultiplied space then convert back to straight-alpha.
  // This avoids dirty/black fringes on light backgrounds under standard SRC_ALPHA blending.
  vec3 premulBase = base.rgb * base.a;
  vec3 premulGlow = u_glowColor * a;
  vec3 premul = premulBase + premulGlow;
  float outA = clamp(base.a + a - base.a * a, 0.0, 1.0);
  vec3 outRgb = (outA > 1e-5) ? (premul / outA) : vec3(0.0);
  outRgb = clamp(outRgb, 0.0, 1.0);

  if (u_knockout > 0.5) {
    outColor = vec4(u_glowColor, a);
  } else {
    outColor = vec4(outRgb, outA);
  }
}`
