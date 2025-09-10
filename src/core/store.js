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

  getToolState(id) {
    const tools = this.state.tools || (this.state.tools = {});
    if (!tools[id]) {
      tools[id] = { ...toolDefaults };
    }
    return { ...tools[id] };
  }

  setToolState(id, updates) {
    const tools = this.state.tools || (this.state.tools = {});
    const oldTool = { ...(tools[id] || { ...toolDefaults }) };
    const oldState = { ...this.state };
    tools[id] = { ...oldTool, ...updates };
    this.subs.forEach((f) => f(this.state, oldState));
    this.eventBus.emit('store:updated', {
      oldState,
      newState: this.state,
      changes: { [id]: updates },
    });
  }
}

export function createStore(initial, eventBus) {
  return new Store(initial, eventBus);
}

export const defaultState = {
  toolId: 'pencil',
  tools: {},
};

export const toolDefaults = {
  brushSize: 4,
  smoothAlpha: 0.55,
  spacingRatio: 0.4,
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  fillOn: true,
  antialias: false,
  nurbsWeight: 1,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 24,
};
