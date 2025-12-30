export const vsBasic2d = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec2 a_uv;
uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
out vec2 v_uv;
void main() {
  vec2 screen = a_pos * u_zoom + u_pan;
  vec2 clip = vec2((screen.x / u_resolution.x) * 2.0 - 1.0, 1.0 - (screen.y / u_resolution.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv;
}`

export const fsBasicColor = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}`

export const fsBasicTexture = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sampler;
uniform float u_alpha;
out vec4 outColor;
void main() {
  vec4 c = texture(u_sampler, v_uv);
  outColor = vec4(c.rgb, c.a * u_alpha);
}`
