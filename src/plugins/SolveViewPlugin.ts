//// @ts-expect-error
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// import { syntaxTree } from "@codemirror/language";
import { SolveResultWidget } from "@/widgets/SolveResultWidget";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginSpec,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";

class SolveViewPlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		console.debug(`[SolveViewPlugin] Constructer`);
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			// console.debug(`[SolveViewPlugin] Document/View Changed`, update.state.doc.toString());
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {
		console.debug(`[SolveViewPlugin] Destroyed`);
	}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		for (const { from, to } of view.visibleRanges) {
			console.debug(from, to);

			builder.add(
				from,
				from,
				Decoration.replace({
					widget: new SolveResultWidget("2001"),
				})
			);
		}

		return builder.finish();
	}

	// buildDecorations(view: EditorView): DecorationSet {
	// 	const builder = new RangeSetBuilder<Decoration>();

	// 	for (const { from, to } of view.visibleRanges) {
	// 		syntaxTree(view.state).iterate({
	// 			from,
	// 			to,
	// 			enter(node: any) {
	// 				if (node.type.name.startsWith("list")) {
	// 					// Position of the '-' or the '*'.
	// 					const listCharFrom = node.from - 2;

	// 					builder.add(
	// 						listCharFrom,
	// 						listCharFrom + 1,
	// 						Decoration.widget({
	// 							widget: new EmojiWidget(),
	// 						})
	// 					);
	// 				}
	// 			},
	// 		});
	// 	}

	// 	return builder.finish();
	// }
}

const pluginSpec: PluginSpec<SolveViewPlugin> = {
	decorations: (value: SolveViewPlugin) => value.decorations,
};

export const solveViewPlugin = ViewPlugin.fromClass(
	SolveViewPlugin,
	pluginSpec
);
