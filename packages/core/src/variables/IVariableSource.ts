/**
 * Interface for variable value providers.
 *
 * Implementations provide named variables to the {@link VariableResolver}.
 * Each source has a priority — lower numbers are queried first.
 *
 * Sources can be backed by document variables, Obsidian frontmatter,
 * plugin data, or any external data store.
 */
export interface IVariableSource {
	/** Human-readable name for this source (e.g., "Document Variables", "Frontmatter"). */
	name: string;
	/**
	 * Priority for resolution order. Lower numbers = higher priority.
	 * Sources with the same priority are queried in registration order.
	 */
	priority: number;
	/**
	 * Get a variable's value.
	 * @param name - The variable name to look up
	 * @returns The value, or undefined if not found in this source
	 */
	get(name: string): Promise<number | string | undefined>;
	/**
	 * Set a variable's value in this source.
	 * @param name - The variable name
	 * @param value - The value to set
	 */
	set(name: string, value: number | string): Promise<void>;
}
