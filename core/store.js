import { EventBus } from './event-bus.js';

export class Store {
  constructor(initial = {}, eventBus = new EventBus()) {
    this.state = { ...initial };
    this.subs = new Set();
    this.eventBus = eventBus;
  }

  getState() {
    return { ...this.state };
  }

  set(updates) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };
    this.subs.forEach((f) => f(this.state, oldState));
    this.eventBus.emit('store:updated', {
      oldState,
      newState: this.state,
      changes: updates,
    });
  }

  subscribe(f) {
    this.subs.add(f);
    return () => this.subs.delete(f);
  }
}

export function createStore(initial, eventBus) {
  return new Store(initial, eventBus);
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
