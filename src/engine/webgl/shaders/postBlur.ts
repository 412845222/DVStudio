export const vsPostBlur = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main(){
  // Standard GL texture coordinates: v=0 is BOTTOM
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

export const fsPostBlur = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_sampler;
uniform vec2 u_texel;
uniform vec2 u_dir;
uniform float u_radius;
out vec4 outColor;

void main(){
  // 7-tap gaussian (normalized)
  vec2 off = u_dir * u_texel * max(0.0, u_radius);
  // Premultiplied blur to avoid black/dirty fringes when blurring over transparent.
  vec4 s0 = texture(u_sampler, v_uv);
  s0.rgb *= s0.a;
  vec4 c = s0 * 0.217;

  vec4 s1p = texture(u_sampler, v_uv + 1.0 * off); s1p.rgb *= s1p.a;
  vec4 s1n = texture(u_sampler, v_uv - 1.0 * off); s1n.rgb *= s1n.a;
  c += s1p * 0.190;
  c += s1n * 0.190;

  vec4 s2p = texture(u_sampler, v_uv + 2.0 * off); s2p.rgb *= s2p.a;
  vec4 s2n = texture(u_sampler, v_uv - 2.0 * off); s2n.rgb *= s2n.a;
  c += s2p * 0.131;
  c += s2n * 0.131;

  vec4 s3p = texture(u_sampler, v_uv + 3.0 * off); s3p.rgb *= s3p.a;
  vec4 s3n = texture(u_sampler, v_uv - 3.0 * off); s3n.rgb *= s3n.a;
  c += s3p * 0.070;
  c += s3n * 0.070;

  // Un-premultiply back to straight alpha for standard SRC_ALPHA blending.
  float a = max(c.a, 1e-5);
  c.rgb /= a;
  outColor = c;
}`
