import { stringValue, type Value } from "@solve-js/vm/Value";

/**
 * Handler registered at {@link REVERSE_PLUGIN_FN_IDX} — receives the
 * arguments pushed by {@link ReverseKeywordParselet}'s bytecode (here, a
 * single string) and returns a new {@link Value}.
 *
 * A plugin function may return synchronously (as here) or a `Promise<Value>`
 * for data that needs to be fetched — see `examples/osrs` for that case.
 */
export function reverseString(args: Value[]): Value {
  const text = args[0].value as string;
  return stringValue([...text].reverse().join(""));
}
