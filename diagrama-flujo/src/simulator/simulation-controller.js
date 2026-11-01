export class SimulationController {
  constructor(engine, onStateChange = () => {}) {
    this.engine = engine;
    this.onStateChange = onStateChange;
    this.timer = null;
    this.engine.onStateChange = (state) => {
      this.onStateChange(state);
      if (state.status !== "running") this.stopTimer();
    };
  }

  start(functionName) {
    this.stopTimer();
    this.engine.start(functionName);
  }

  next() {
    return this.engine.stepForward();
  }

  previous() {
    return this.engine.stepBackward();
  }

  run(speed = 500) {
    this.stopTimer();
    if (!["paused"].includes(this.engine.state.status)) return;
    this.engine.state.status = "running";
    this.engine.state.message = "Simulación automática en curso.";
    this.engine.notify();
    const interval = Math.max(100, Math.min(3000, Number(speed) || 500));
    this.timer = window.setInterval(() => {
      if (this.engine.state.status !== "running") {
        this.stopTimer();
        return;
      }
      this.engine.stepForward();
    }, interval);
  }

  pause() {
    this.stopTimer();
    this.engine.pause();
  }

  restart() {
    this.stopTimer();
    this.engine.restart();
  }

  invalidate(message) {
    this.stopTimer();
    this.engine.invalidate(message);
  }

  provideInput(value) {
    this.engine.provideInput(value);
    return this.engine.stepForward();
  }

  setVariable(name, value) {
    this.engine.setVariable(name, value);
  }

  setMaxSteps(value) {
    this.engine.setMaxSteps(value);
  }

  stopTimer() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
