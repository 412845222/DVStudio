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
  vec4 c = texture(u_sampler, v_uv) * 0.217;
  c += texture(u_sampler, v_uv + 1.0 * off) * 0.190;
  c += texture(u_sampler, v_uv - 1.0 * off) * 0.190;
  c += texture(u_sampler, v_uv + 2.0 * off) * 0.131;
  c += texture(u_sampler, v_uv - 2.0 * off) * 0.131;
  c += texture(u_sampler, v_uv + 3.0 * off) * 0.070;
  c += texture(u_sampler, v_uv - 3.0 * off) * 0.070;
  outColor = c;
}`
