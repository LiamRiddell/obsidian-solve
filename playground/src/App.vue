<template>
  <div class="app-root">
    <HeaderBar />

    <div class="main-layout">
      <div class="main-body">
        <!-- Center: Editor (examples picker now lives in its header) -->
        <EditorPane ref="editorRef" />

        <!-- Resize handle: editor / diagnostics -->
        <div class="resize-handle" id="resize-handle-editor" @mousedown="startResize($event)"></div>

        <!-- Right: Diagnostics -->
        <DiagnosticsPane />
      </div>
    </div>

    <StatusBar />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import HeaderBar from './components/HeaderBar.vue';
import StatusBar from './components/StatusBar.vue';
import EditorPane from './components/EditorPane.vue';
import DiagnosticsPane from './components/DiagnosticsPane.vue';
import { useEditorStore } from './stores/editor.js';
import { usePipelineStore } from './stores/pipeline.js';

const editorStore = useEditorStore();
const pipeline = usePipelineStore();

// Reference to editor component for insertExample
const editorRef = ref<InstanceType<typeof EditorPane> | null>(null);
editorStore.setEditorRef(editorRef);

/* ── Resize handle: editor / diagnostics ─────────────────────────── */
let resizeState: {
  handle: HTMLElement;
  prevEl: HTMLElement;
  nextEl: HTMLElement;
  startX: number;
  startNextW: number;
} | null = null;

function startResize(e: MouseEvent): void {
  const handle = e.target as HTMLElement;
  const prevEl = document.getElementById('editor-pane')!;
  const nextEl = document.getElementById('diagnostics-pane')!;

  resizeState = {
    handle, prevEl, nextEl,
    startX: e.clientX,
    startNextW: nextEl.getBoundingClientRect().width,
  };

  handle.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
}

function onResizeMove(e: MouseEvent): void {
  if (!resizeState) return;
  const dx = e.clientX - resizeState.startX;
  const newNext = Math.max(80, resizeState.startNextW - dx);
  resizeState.nextEl.style.flex = '0 0 ' + newNext + 'px';
  resizeState.prevEl.style.flex = '1';
}

function onResizeEnd(): void {
  if (!resizeState) return;
  resizeState.handle.classList.remove('active');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  resizeState = null;
}

/* ── Keyboard shortcuts ───────────────────────────────────────── */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && pipeline.flamegraphFilter !== null) {
    e.preventDefault();
    pipeline.clearFlamegraphFilter();
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>
