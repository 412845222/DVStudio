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

// Simple stable hash noise in screen space.
// Used as dithering to reduce visible banding in 8-bit alpha gradients.
float dvs_hash(vec2 p) {
  // https://www.shadertoy.com/view/4djSRW (classic hash), adapted.
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  // Adobe/Flash-like glow: driven by alpha silhouette, glowColor independent from source RGB.
  vec4 base = texture(u_sampler, v_uv);
  vec4 blur = texture(u_blur, v_uv);
  // Outer glow: prefer a mask-based strength so thin AA edges still produce visible glow.
  float outer = clamp(blur.a * (1.0 - base.a), 0.0, 1.0);
  // Inner glow: keep the classic (base - blur) edge signal.
  float inner = max(0.0, base.a - blur.a);
  float strength = mix(outer, inner, step(0.5, u_inner));

  // Softer intensity mapping (avoid hard opaque "light柱" near edges).
  // Use a smooth saturating curve so small values still lift but mid-values don't instantly clamp.
  float gain = clamp(u_intensity, 0.0, 64.0);
  float s = clamp(strength, 0.0, 1.0);
  float x = s * (gain * 2.0);
  float a = x / (1.0 + x);
  a = clamp(a, 0.0, 1.0);

  // When exporting with transparency, the glow lives mainly in alpha and gets quantized to 8-bit
  // (readPixels -> PNG). This can show as stepped "light柱" banding after compositing.
  // Apply a tiny dither to the glow alpha only when the base alpha is not opaque.
  if (base.a < 0.999) {
    float n = dvs_hash(gl_FragCoord.xy);
    // +/- 0.5 LSB in 8-bit space (slightly stronger to mask compression), scaled by edge strength.
    float amp = (1.25 / 255.0) * clamp(a, 0.0, 1.0);
    a = clamp(a + (n - 0.5) * 2.0 * amp, 0.0, 1.0);
  }

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
