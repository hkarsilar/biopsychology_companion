/** Shared styles for every simulation's shadow root. Colours come from the site tokens. */
export const uiCss = /* css */ `
:host {
  display: block;
  font-family: var(--font-body, system-ui, sans-serif);
  color: var(--text, #e9edf5);
  --sim-gap: 0.85rem;
  --sim-font: 0.95rem;
  margin: 1.75rem 0;
  container-type: inline-size;
}
:host([present]) { --sim-font: 1.2rem; }
* { box-sizing: border-box; }
.sim {
  position: relative;
  background: var(--surface, #151c2c);
  border: 1px solid var(--border, #2c3854);
  border-radius: var(--radius-l, 20px);
  box-shadow: var(--shadow);
  padding: 1rem;
  font-size: var(--sim-font);
  line-height: 1.45;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
  margin-bottom: 0.75rem;
}
.title {
  font-family: var(--font-display, system-ui);
  font-weight: 700;
  font-size: 1.15em;
  line-height: 1.2;
}
.title small {
  display: block;
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 0.78em;
  color: var(--text-muted, #a9b3c7);
}
.transport {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}
button, select, input { font: inherit; color: inherit; }
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  min-height: 2.5rem;
  min-width: 2.5rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--border-strong, #3f4d6e);
  background: var(--surface-2, #1c2538);
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
}
button:hover { border-color: var(--accent, #b69cff); }
button.primary {
  background: var(--accent, #b69cff);
  border-color: var(--accent, #b69cff);
  color: var(--accent-ink, #160b3a);
}
button.primary:hover { background: var(--accent-strong, #cbb8ff); }
button[aria-pressed='true'] {
  background: var(--accent-soft, rgba(182,156,255,.14));
  border-color: var(--accent, #b69cff);
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
:focus-visible { outline: 3px solid var(--focus, #ffd166); outline-offset: 2px; }
select {
  min-height: 2.5rem;
  border-radius: 999px;
  border: 1px solid var(--border-strong, #3f4d6e);
  background: var(--surface-2, #1c2538);
  padding: 0.3rem 0.7rem;
}
.timescale {
  font-family: var(--font-mono, monospace);
  font-size: 0.8em;
  color: var(--text-muted, #a9b3c7);
}
.caption {
  min-height: 3em;
  padding: 0.55rem 0.8rem;
  border-radius: var(--radius-s, 6px);
  background: var(--surface-2, #1c2538);
  border-left: 4px solid var(--accent, #b69cff);
  margin-bottom: var(--sim-gap);
}
.views {
  display: grid;
  gap: var(--sim-gap);
  grid-template-columns: 1fr;
}
@container (min-width: 760px) {
  .views.two { grid-template-columns: 1fr 1.25fr; }
}
figure { margin: 0; }
canvas {
  display: block;
  width: 100%;
  border-radius: var(--radius, 12px);
  background: var(--bg, #0e1320);
  border: 1px solid var(--border, #2c3854);
  touch-action: manipulation;
}
figcaption {
  font-size: 0.8em;
  color: var(--text-muted, #a9b3c7);
  margin-top: 0.35rem;
}
.readouts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  margin: var(--sim-gap) 0;
  font-family: var(--font-mono, monospace);
  font-size: 0.85em;
}
.readouts b { font-weight: 500; color: var(--text-muted, #a9b3c7); margin-right: 0.35em; }
.controls {
  display: grid;
  gap: var(--sim-gap);
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}
fieldset {
  border: 1px solid var(--border, #2c3854);
  border-radius: var(--radius, 12px);
  padding: 0.6rem 0.85rem 0.85rem;
  margin: 0;
  min-width: 0;
}
legend {
  font-family: var(--font-display, system-ui);
  font-weight: 700;
  padding: 0 0.35rem;
}
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
.slider { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0.2rem 0.6rem; margin-top: 0.55rem; }
.slider label { grid-column: 1 / -1; font-size: 0.88em; color: var(--text-muted, #a9b3c7); }
.slider output { font-family: var(--font-mono, monospace); font-size: 0.85em; min-width: 6.5ch; text-align: right; }
input[type='range'] { width: 100%; accent-color: var(--accent, #b69cff); min-height: 1.75rem; }
.toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-top: 0.5rem;
  cursor: pointer;
}
.toggle input { width: 1.15rem; height: 1.15rem; margin-top: 0.2rem; accent-color: var(--accent, #b69cff); flex: none; }
.toggle span small { display: block; color: var(--text-muted, #a9b3c7); font-size: 0.85em; }
.keys { font-size: 0.78em; color: var(--text-faint, #7d889f); margin-top: 0.75rem; }
kbd {
  font-family: var(--font-mono, monospace);
  border: 1px solid var(--border-strong, #3f4d6e);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0 0.3em;
  font-size: 0.95em;
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--bg, #0e1320) 72%, transparent);
  border-radius: inherit;
  padding: 1rem;
  z-index: 5;
}
.overlay[hidden] { display: none; }
.dialog {
  max-width: 34rem;
  width: 100%;
  background: var(--surface, #151c2c);
  border: 1px solid var(--accent, #b69cff);
  border-radius: var(--radius, 12px);
  padding: 1.1rem 1.2rem;
  box-shadow: var(--shadow);
}
.dialog .eyebrow {
  font-family: var(--font-mono, monospace);
  font-size: 0.75em;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent, #b69cff);
}
.dialog h3 { font-family: var(--font-display); margin: 0.25rem 0 0.75rem; font-size: 1.15em; line-height: 1.3; }
.options { display: grid; gap: 0.5rem; }
.options button { justify-content: flex-start; text-align: left; white-space: normal; border-radius: var(--radius-s, 6px); }
.options button.right { border-color: var(--good, #5fd3a2); background: color-mix(in srgb, var(--good, #5fd3a2) 15%, transparent); }
.options button.wrong { border-color: var(--bad, #ff8a80); }
.feedback { margin-top: 0.75rem; }
.feedback p { margin: 0 0 0.75rem; }
.legend { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; font-size: 0.8em; color: var(--text-muted, #a9b3c7); margin-top: 0.4rem; }
.legend i { display: inline-block; width: 0.8em; height: 0.8em; margin-right: 0.35em; vertical-align: -0.05em; }
.legend i.round { border-radius: 50%; }
.legend i.line { height: 3px; width: 1.2em; vertical-align: 0.25em; }
.tabs { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.note { font-size: 0.85em; color: var(--text-muted, #a9b3c7); }
`;
