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
  float outer = max(0.0, blur.a - base.a);
  float inner = max(0.0, base.a - blur.a);
  float strength = mix(outer, inner, step(0.5, u_inner));
  float a = clamp(strength * max(0.0, u_intensity), 0.0, 1.0);
  vec4 glow = vec4(u_glowColor * a, a);
  vec4 res = base + glow;
  if (u_knockout > 0.5) res = glow;
  outColor = res;
}`
