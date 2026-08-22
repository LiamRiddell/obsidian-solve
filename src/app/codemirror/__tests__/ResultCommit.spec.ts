jest.mock("obsidian", () => ({
	moment: () => undefined,
	Plugin: class {},
	PluginSettingTab: class {},
}));

import { pluginEventBus } from "@app/eventbus/PluginEventBus";
import SolvePlugin from "@app/main";
import { ExpressionResultWidget } from "@app/codemirror/widgets/ExpressionResultWidget";
import { EditorState, TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

class FakeElement {
	public dataset: Record<string, string> = {};
	public classList = { add: jest.fn() };
	public style = { setProperty: jest.fn() };
	public title = "";
	public textContent = "";
	private listeners = new Map<string, () => void>();

	addEventListener(type: string, listener: () => void): void {
		this.listeners.set(type, listener);
	}

	click(): void {
		this.listeners.get("click")?.();
	}
}

describe("result commits", () => {
	const originalDocument = globalThis.document;

	afterEach(() => {
		pluginEventBus.removeAllListeners();
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: originalDocument,
		});
	});

	it("commits a table-cell result through its originating view, not the global YAML editor", async () => {
		const element = new FakeElement();
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { createElement: () => element },
		});

		// Obsidian's table cell has a local CodeMirror document whose first
		// line does not correspond to line 1 in the global active editor.
		let sourceState = EditorState.create({ doc: "1 + 2" });
		const sourceView = {
			get state() {
				return sourceState;
			},
			dispatch(spec: TransactionSpec) {
				sourceState = sourceState.update(spec).state;
			},
		} as unknown as EditorView;

		const yamlEditor = {
			lines: ["---", "title: Example", "---"],
			getLine(line: number) {
				return this.lines[line];
			},
			setLine(line: number, text: string) {
				this.lines[line] = text;
			},
		};

		const plugin = Object.create(SolvePlugin.prototype) as SolvePlugin & {
			registerEvents(): Promise<void>;
		};
		Object.assign(plugin, {
			app: { workspace: { activeEditor: { editor: yamlEditor } } },
			settings: {
				inlineSolve: {
					includeEqualsOnCommit: true,
					includeExpressionOnCommit: false,
					includeBackticksOnCommit: false,
				},
			},
		});
		await plugin.registerEvents();

		const widget = new ExpressionResultWidget(1, false, "1 + 2", "= 3");
		const rendered = widget.toDOM(sourceView) as unknown as FakeElement;
		rendered.click();

		expect({
			source: sourceView.state.doc.toString(),
			yaml: yamlEditor.lines,
		}).toEqual({
			source: "1 + 2 = 3",
			yaml: ["---", "title: Example", "---"],
		});
	});
});
