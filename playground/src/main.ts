import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// ── Suppress the benign "ResizeObserver loop" browser warning ──────────
// CodeMirror's tooltip positioning (the autocomplete dropdown in
// particular — it repositions itself against the editor's measured size
// every time its content changes, e.g. on every keystroke while typing a
// completion prefix) can trip Chrome's ResizeObserver loop guard. The
// spec's own mitigation already recovers on the next frame — this is not
// a real error — but Vite's dev-mode error overlay treats ANY uncaught
// `window.onerror` as fatal and takes over the whole page with a
// full-screen overlay, which re-fires on the next resize tick and makes
// the app look hung/crashed even though nothing is actually broken.
// Stop ONLY this specific benign message from propagating; every other
// error still surfaces normally.
const RESIZE_OBSERVER_LOOP_ERROR = /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/;
window.addEventListener('error', (event) => {
	if (RESIZE_OBSERVER_LOOP_ERROR.test(event.message)) {
		event.stopImmediatePropagation();
	}
});

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
