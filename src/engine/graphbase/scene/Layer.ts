export enum Layer {
  BACKGROUND = 0,
  GRID = 10,
  EDGES = 20,
  NODES = 30,
  ANCHORS = 40,
  SELECTION = 50,
  OVERLAY = 60,
  UI = 70
}

export enum DirtyFlag {
  NONE = 0,
  TRANSFORM = 1 << 0,
  APPEARANCE = 1 << 1,
  CHILDREN = 1 << 2,
  CONTENT = 1 << 3,
  ALL = TRANSFORM | APPEARANCE | CHILDREN | CONTENT
}
