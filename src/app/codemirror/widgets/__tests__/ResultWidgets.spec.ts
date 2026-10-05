/**
 * @jest-environment jsdom
 */

/**
 * The result widget and the refusal marker, as a reader meets them (#98,
 * #96): a result is a button with a name, a pending result says what it waits
 * for, a refusal gives its reason to the pointer and the keyboard alike, and
 * the default colours reach WCAG AA contrast on both themes.
 */

import { afterEach, describe, expect, test } from "@jest/globals";
import * as fs from "node:fs";
import * as path from "node:path";
import { ExpressionResultWidget } from "@app/codemirror/widgets/ExpressionResultWidget";
import { RefusalMarkerWidget, refusalCode } from "@app/codemirror/widgets/RefusalMarkerWidget";
import { EPluginEvent } from "@app/constants/EPluginEvent";
import { pluginEventBus } from "@app/eventbus/PluginEventBus";

const view = {} as never;

describe("the result widget (#98)", () => {
	afterEach(() => pluginEventBus.removeAllListeners());

	test("is a button with a name a screen reader announces", () => {
		const el = new ExpressionResultWidget(3, false, "1000 + 200", "= 1,200").toDOM(view);
		expect(el.tagName).toBe("BUTTON");
		expect((el as HTMLButtonElement).type).toBe("button");
		expect(el.getAttribute("aria-label")).toBe("Commit result 1,200");
		expect(el.textContent).toBe("= 1,200");
		expect(el.dataset.osrLine).toBe("3");
		expect(el.classList.contains("os-result")).toBe(true);
	});

	test("activating it commits the result, as a click did", () => {
		const seen: unknown[][] = [];
		pluginEventBus.on(EPluginEvent.WriteResultToActiveDocumentLine, (...args) => seen.push(args));
		const el = new ExpressionResultWidget(3, false, "1000 + 200", "= 1,200").toDOM(view) as HTMLButtonElement;
		el.click();
		expect(seen).toEqual([[3, "1000 + 200", "= 1,200", false]]);
	});

	test("a pending result is a status that says what it waits for, its glyphs hidden", () => {
		const el = new ExpressionResultWidget(5, false, "100 USD in EUR", "", true, "fx:USD:EUR").toDOM(view);
		expect(el.tagName).toBe("SPAN");
		expect(el.getAttribute("role")).toBe("status");
		expect(el.getAttribute("aria-label")).toBe("Waiting for live data");
		expect(el.getAttribute("data-query-key")).toBe("fx:USD:EUR");
		const hidden = Array.from(el.children).map((c) => c.getAttribute("aria-hidden"));
		expect(hidden).toEqual(["true", "true"]);
	});
});

describe("the refusal marker (#96)", () => {
	test("is focusable, and names its reason for the keyboard and a screen reader", () => {
		const el = new RefusalMarkerWidget(4, "INCOMPATIBLE_UNITS", "a mass cannot be converted to a length").toDOM();
		expect(el.tabIndex).toBe(0);
		expect(el.getAttribute("role")).toBe("note");
		expect(el.getAttribute("aria-label")).toBe("Solve did not calculate this line: a mass cannot be converted to a length");
		expect(el.dataset.code).toBe("INCOMPATIBLE_UNITS");
		expect(el.querySelector(".os-refusal__message")?.textContent).toBe("a mass cannot be converted to a length");
	});

	test("security: a message holding markup is shown as text, never parsed", () => {
		const message = '"<img src=x onerror=alert(1)>" is not a date';
		const el = new RefusalMarkerWidget(1, "DATE_ORDER_MISMATCH", message).toDOM();
		expect(el.querySelector("img")).toBeNull();
		expect(el.querySelector(".os-refusal__message")?.textContent).toBe(message);
	});

	test("refusalCode: a named code is shown, the generic eval_failed and nothing are not", () => {
		expect(refusalCode("INCOMPATIBLE_UNITS")).toBe("INCOMPATIBLE_UNITS");
		expect(refusalCode("DATE_ORDER_MISMATCH")).toBe("DATE_ORDER_MISMATCH");
		for (const none of ["eval_failed", "", null, undefined]) expect(refusalCode(none)).toBeNull();
	});

	test("two markers are equal only with the same line, code and reason", () => {
		const a = new RefusalMarkerWidget(1, "X", "m");
		expect(a.eq(new RefusalMarkerWidget(1, "X", "m"))).toBe(true);
		expect(a.eq(new RefusalMarkerWidget(2, "X", "m"))).toBe(false);
		expect(a.eq(new RefusalMarkerWidget(1, "Y", "m"))).toBe(false);
		expect(a.eq(new RefusalMarkerWidget(1, "X", "n"))).toBe(false);
	});
});

describe("the stylesheet (#98)", () => {
	const css = fs.readFileSync(path.join(__dirname, "../../../styles/result.css"), "utf8");

	/** WCAG relative luminance of a #rrggbb colour. */
	function luminance(hex: string): number {
		const [r, g, b] = (hex.match(/[0-9a-f]{2}/gi) ?? []).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}
	const contrast = (a: string, b: string) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	};
	const defaultFor = (selector: string) => new RegExp(`${selector.replace(".", "\\.")}\\s*\\{\\s*--solve-result-text-default:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1];

	test("the default result colour reaches 4.5:1 on each theme's background", () => {
		const light = defaultFor("body.theme-light");
		const dark = defaultFor("body");
		expect(light).toBeDefined();
		expect(dark).toBeDefined();
		expect(contrast(light!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
		expect(contrast(light!, "#f6f6f6")).toBeGreaterThanOrEqual(4.5);
		expect(contrast(dark!, "#1e1e1e")).toBeGreaterThanOrEqual(4.5);
		// The old default, composited at its alpha on white, failed: 1.9:1.
		expect(contrast("#3cd2a2", "#ffffff")).toBeLessThan(2);
	});

	test("the Style Settings override still wins over the default", () => {
		expect(css).toMatch(/color:\s*var\(--solve-result-text,\s*var\(--solve-result-text-default\)\)/);
	});

	test("the spinner stops for a reader who asked for less motion, and focus is visible", () => {
		expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.os-result__spinner\s*\{\s*animation:\s*none;/);
		expect(css).toMatch(/\.os-result:focus-visible\s*\{[^}]*outline:/);
		expect(css).toMatch(/\.os-refusal:focus-visible\s*\{[^}]*outline:/);
		expect(css).toMatch(/\.os-refusal:hover \.os-refusal__message,\s*\.os-refusal:focus \.os-refusal__message\s*\{\s*display:\s*block;/);
	});
});
