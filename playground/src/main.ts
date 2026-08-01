import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// ── Disable ResizeObserver-driven tooltip repositioning ────────────────
// CodeMirror's tooltip plugin (@codemirror/view) creates a ResizeObserver
// per tooltip and re-measures/repositions on every resize tick of that
// tooltip's DOM — the autocomplete dropdown hits this on every keystroke
// while typing a completion prefix, since its content (and therefore
// size) changes each time. In some browsers (reported: Brave) this
// resize -> reposition -> resize cycle runs fast enough to peg the main
// thread and hang the tab, rather than settling after the one frame the
// spec's own loop-limit mitigation assumes.
//
// CodeMirror already treats a missing ResizeObserver as a supported
// fallback rather than an error — see the tooltip plugin's own guard,
// `typeof ResizeObserver == "function" ? new ResizeObserver(...) : null`,
// with every use of `this.resizeObserver` null-checked. Deleting the
// global constructor here before any editor is created routes tooltips
// through that fallback: they still reposition on document changes and
// window resize, just not on every intermediate DOM resize tick.
delete (window as { ResizeObserver?: unknown }).ResizeObserver;

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
