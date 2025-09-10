export function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  return {
    getState: () => state,
    set(p) {
      state = { ...state, ...p };
      subs.forEach((f) => f(state));
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

export const defaultState = {
  toolId: "pencil",
  primaryColor: "#000000",
  secondaryColor: "#ffffff",
  brushSize: 4,
  smoothAlpha: 0.55,
  spacingRatio: 0.4,
  fillOn: true,
  antialias: false,
};
