<template>
  <div class="flow-stage" :class="{ executed: executed, error: hasError, collapsed: collapsed, 'flash-pulse': pulsing }">
    <div class="flow-stage-header" :class="[colorClass, { 'header-pulse': pulsing }]" @click="toggle">
      <span class="flow-stage-step">{{ stepNumber }}</span>
      <span class="flow-stage-icon">{{ icon }}</span>
      <span class="flow-stage-name">{{ label }}</span>
      <span class="flow-stage-active-line">{{ activeLine }}</span>
      <span class="flow-stage-time">{{ timeLabel }}</span>
    </div>
    <div class="flow-stage-body">
      <div v-if="input" class="flow-stage-input">{{ input }}</div>
      <div v-if="showArrow" class="flow-stage-arrow">↓</div>
      <div v-if="outputLabel" class="flow-stage-output-label">{{ outputLabel }}</div>
      <div v-if="isResult" class="flow-stage-output-result">
        <slot name="output">
          <span class="empty">—</span>
        </slot>
      </div>
      <div v-else class="flow-stage-output">
        <slot name="output">
          <span class="empty">—</span>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  stepNumber: number;
  icon: string;
  label: string;
  colorClass: string;
  timeLabel: string;
  activeLine: string;
  modelValue: boolean;
  input?: string;
  outputLabel?: string;
  showArrow?: boolean;
  isResult?: boolean;
  executed?: boolean;
  hasError?: boolean;
  pulsing?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const collapsed = computed(() => props.modelValue);

function toggle(): void {
  emit('update:modelValue', !props.modelValue);
}
</script>
