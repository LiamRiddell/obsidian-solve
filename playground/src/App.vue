<template>
  <div class="app-root">
    <HeaderBar />

    <div class="main-layout">
      <div class="main-body">
        <!-- Left Sidebar -->
        <Sidebar />

        <!-- Resize handle: sidebar / editor -->
        <div class="resize-handle" id="resize-handle-sidebar" @mousedown="startResize('sidebar', $event)"></div>

        <!-- Center: Editor -->
        <EditorPane ref="editorRef" />

        <!-- Resize handle: editor / diagnostics -->
        <div class="resize-handle" id="resize-handle-editor" @mousedown="startResize('editor', $event)"></div>

        <!-- Right: Diagnostics -->
        <DiagnosticsPane />
      </div>

      <!-- Errors Bar -->
      <ErrorsBar />
    </div>

    <FooterBar />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import HeaderBar from './components/HeaderBar.vue';
import FooterBar from './components/FooterBar.vue';
import Sidebar from './components/Sidebar.vue';
import EditorPane from './components/EditorPane.vue';
import DiagnosticsPane from './components/DiagnosticsPane.vue';
import ErrorsBar from './components/ErrorsBar.vue';
import { useEditorStore } from './stores/editor.js';
import { usePipelineStore } from './stores/pipeline.js';

const editorStore = useEditorStore();
const pipeline = usePipelineStore();

// Reference to editor component for insertExample
const editorRef = ref<InstanceType<typeof EditorPane> | null>(null);
editorStore.setEditorRef(editorRef);

/* ── Resize handles ────────────────────────────────────────────── */
let resizeState: {
  handle: HTMLElement;
  prevEl: HTMLElement;
  nextEl: HTMLElement;
  direction: 'grow-prev' | 'grow-next';
  startX: number;
  startPrevW: number;
  startNextW: number;
} | null = null;

function startResize(which: 'sidebar' | 'editor', e: MouseEvent): void {
  const handle = e.target as HTMLElement;
  let prevEl: HTMLElement, nextEl: HTMLElement, direction: 'grow-prev' | 'grow-next';

  if (which === 'sidebar') {
    prevEl = document.getElementById('sidebar')!;
    nextEl = document.getElementById('editor-pane')!;
    direction = 'grow-prev';
  } else {
    prevEl = document.getElementById('editor-pane')!;
    nextEl = document.getElementById('diagnostics-pane')!;
    direction = 'grow-next';
  }

  resizeState = {
    handle, prevEl, nextEl, direction,
    startX: e.clientX,
    startPrevW: prevEl.getBoundingClientRect().width,
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
  if (resizeState.direction === 'grow-prev') {
    const newPrev = Math.max(80, resizeState.startPrevW + dx);
    resizeState.prevEl.style.width = newPrev + 'px';
    resizeState.prevEl.style.flexShrink = '0';
    resizeState.nextEl.style.flex = '1';
  } else {
    const newNext = Math.max(80, resizeState.startNextW - dx);
    resizeState.nextEl.style.flex = '0 0 ' + newNext + 'px';
    resizeState.prevEl.style.flex = '1';
  }
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
