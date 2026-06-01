<!--#region 📦 Module Overview -->
/**
 * ParseletRegistryTab.vue — Shows all registered parselets with token types
 * and binding powers for debugging the parser configuration.
 *
 * @component ParseletRegistryTab
 */
<!--#endregion -->

<template>
  <div class="tab-panel active" id="panel-parselet-registry">
    <div class="panel-toolbar">
      <div class="panel-toolbar-left">
        <input
          type="text"
          class="token-filter-input"
          placeholder="Filter parselets…"
          spellcheck="false"
          v-model="filterQuery"
        />
      </div>
      <span class="token-count">{{ filteredPrefix.length + filteredInfix.length }} parselets</span>
    </div>
    <div class="panel-scroll">
      <!-- Prefix Parselets -->
      <div class="parselet-section">
        <div class="parselet-section-header">
          <span class="parselet-section-title">Prefix Parselets</span>
          <span class="constants-section-total">{{ filteredPrefix.length }}</span>
        </div>
        <table v-if="filteredPrefix.length > 0" class="parselet-table">
          <thead>
            <tr>
              <th class="parselet-col-token">Token Type</th>
              <th class="parselet-col-bp">Binding Power</th>
              <th class="parselet-col-desc">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredPrefix" :key="p.tokenType" class="parselet-row">
              <td class="parselet-col-token">
                <span class="parselet-token-chip">{{ p.tokenType }}</span>
              </td>
              <td class="parselet-col-bp">{{ p.bindingPower }}</td>
              <td class="parselet-col-desc">{{ p.description }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="parselet-empty">No prefix parselets registered</div>
      </div>

      <!-- Infix Parselets -->
      <div class="parselet-section" style="margin-top: 12px">
        <div class="parselet-section-header">
          <span class="parselet-section-title">Infix Parselets</span>
          <span class="constants-section-total">{{ filteredInfix.length }}</span>
        </div>
        <table v-if="filteredInfix.length > 0" class="parselet-table">
          <thead>
            <tr>
              <th class="parselet-col-token">Token Type</th>
              <th class="parselet-col-bp">Left BP</th>
              <th class="parselet-col-bp">Right BP</th>
              <th class="parselet-col-desc">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredInfix" :key="p.tokenType" class="parselet-row">
              <td class="parselet-col-token">
                <span class="parselet-token-chip">{{ p.tokenType }}</span>
              </td>
              <td class="parselet-col-bp">{{ p.leftBindingPower }}</td>
              <td class="parselet-col-bp">{{ p.rightBindingPower }}</td>
              <td class="parselet-col-desc">{{ p.description }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="parselet-empty">No infix parselets registered</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

interface PrefixParseletInfo {
  tokenType: string;
  bindingPower: number;
  description: string;
}

interface InfixParseletInfo {
  tokenType: string;
  leftBindingPower: number;
  rightBindingPower: number;
  description: string;
}

const filterQuery = ref('');

// Known prefix parselets with their token types and binding powers
const prefixParselets: PrefixParseletInfo[] = [
  { tokenType: 'NUMBER', bindingPower: 0, description: 'Numeric literal' },
  { tokenType: 'STRING', bindingPower: 0, description: 'String literal' },
  { tokenType: 'IDENT', bindingPower: 0, description: 'Variable/identifier reference' },
  { tokenType: 'LPAREN', bindingPower: 0, description: 'Grouped expression ( ... )' },
  { tokenType: 'MINUS', bindingPower: 80, description: 'Unary negation' },
  { tokenType: 'PLUS', bindingPower: 80, description: 'Unary plus' },
  { tokenType: 'KW_TRUE', bindingPower: 0, description: 'Boolean true literal' },
  { tokenType: 'KW_FALSE', bindingPower: 0, description: 'Boolean false literal' },
  { tokenType: 'MINUS_MINUS', bindingPower: 80, description: 'Unary decrement prefix' },
  { tokenType: 'PLUS_PLUS', bindingPower: 80, description: 'Unary increment prefix' },
  { tokenType: 'BANG', bindingPower: 80, description: 'Logical NOT' },
  { tokenType: 'TILDE', bindingPower: 80, description: 'Bitwise NOT' },
  { tokenType: 'LBRACKET', bindingPower: 0, description: 'Array literal [ ... ]' },
  { tokenType: 'PIPE', bindingPower: 0, description: 'Pipeline start | expr → result' },
];

const infixParselets: InfixParseletInfo[] = [
  { tokenType: 'PIPE', leftBindingPower: 10, rightBindingPower: 11, description: 'Pipeline operator (left-to-right)' },
  { tokenType: 'ASSIGN', leftBindingPower: 10, rightBindingPower: 9, description: 'Variable assignment :x = 5' },
  { tokenType: 'TERNARY_Q', leftBindingPower: 20, rightBindingPower: 19, description: 'Ternary conditional ? :' },
  { tokenType: 'TERNARY_C', leftBindingPower: 20, rightBindingPower: 20, description: 'Ternary colon separator' },
  { tokenType: 'PIPE_PIPE', leftBindingPower: 30, rightBindingPower: 31, description: 'Logical OR (||)' },
  { tokenType: 'AMP_AMP', leftBindingPower: 40, rightBindingPower: 41, description: 'Logical AND (&&)' },
  { tokenType: 'PIPE', leftBindingPower: 50, rightBindingPower: 51, description: 'Bitwise OR (|) (alternate use)' },
  { tokenType: 'CARET', leftBindingPower: 60, rightBindingPower: 61, description: 'Bitwise XOR (^)' },
  { tokenType: 'AMP', leftBindingPower: 70, rightBindingPower: 71, description: 'Bitwise AND (&)' },
  { tokenType: 'EQ_EQ', leftBindingPower: 80, rightBindingPower: 81, description: 'Equality (==)' },
  { tokenType: 'BANG_EQ', leftBindingPower: 80, rightBindingPower: 81, description: 'Inequality (!=)' },
  { tokenType: 'LT', leftBindingPower: 90, rightBindingPower: 91, description: 'Less than (<)' },
  { tokenType: 'GT', leftBindingPower: 90, rightBindingPower: 91, description: 'Greater than (>)' },
  { tokenType: 'LT_EQ', leftBindingPower: 90, rightBindingPower: 91, description: 'Less or equal (<=)' },
  { tokenType: 'GT_EQ', leftBindingPower: 90, rightBindingPower: 91, description: 'Greater or equal (>=)' },
  { tokenType: 'PLUS', leftBindingPower: 100, rightBindingPower: 101, description: 'Addition (+) / string concat' },
  { tokenType: 'MINUS', leftBindingPower: 100, rightBindingPower: 101, description: 'Subtraction (-)' },
  { tokenType: 'STAR', leftBindingPower: 110, rightBindingPower: 111, description: 'Multiplication (*)' },
  { tokenType: 'SLASH', leftBindingPower: 110, rightBindingPower: 111, description: 'Division (/)' },
  { tokenType: 'PERCENT', leftBindingPower: 110, rightBindingPower: 111, description: 'Modulo (%)' },
  { tokenType: 'STAR_STAR', leftBindingPower: 120, rightBindingPower: 119, description: 'Exponentiation (**)' },
  { tokenType: 'DOT', leftBindingPower: 130, rightBindingPower: 131, description: 'Member access (obj.prop)' },
  { tokenType: 'LBRACKET', leftBindingPower: 130, rightBindingPower: 131, description: 'Index access (arr[i])' },
  { tokenType: 'LPAREN', leftBindingPower: 130, rightBindingPower: 131, description: 'Function call fn(...)' },
  { tokenType: 'POUND', leftBindingPower: 5, rightBindingPower: 6, description: 'Inline solve marker #expr#' },
];

function matches(p: { tokenType: string; description: string }, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return p.tokenType.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
}

const filteredPrefix = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  return q ? prefixParselets.filter(p => matches(p, q)) : prefixParselets;
});

const filteredInfix = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  return q ? infixParselets.filter(p => matches(p, q)) : infixParselets;
});
</script>

<style scoped>
.parselet-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
}
.parselet-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-subtle);
}
.parselet-section-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--stage-parser);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.parselet-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 10px;
  background: var(--bg-primary);
}
.parselet-table thead { background: var(--bg-tertiary); }
.parselet-table th {
  padding: 4px 10px;
  font-size: 8px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}
.parselet-col-token { width: 120px; }
.parselet-col-bp { width: 80px; text-align: center; }
.parselet-col-desc { text-align: left; }
.parselet-row { transition: background 0.15s; border-bottom: 1px solid var(--border-subtle); }
.parselet-row:last-child { border-bottom: none; }
.parselet-row:hover { background: var(--bg-tertiary); }
.parselet-row td { padding: 4px 10px; vertical-align: middle; }
.parselet-token-chip {
  display: inline-flex;
  padding: 1px 7px;
  border-radius: 3px;
  background: var(--stage-parser-dim);
  color: var(--stage-parser);
  border: 1px solid rgba(155, 123, 236, 0.25);
  font-weight: 600;
  font-size: 10px;
}
.parselet-empty {
  padding: 12px;
  color: var(--text-muted);
  font-style: italic;
  font-size: 11px;
  text-align: center;
}
</style>
