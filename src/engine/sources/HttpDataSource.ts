import { DataSource } from "../core/PollingEngine";

/**
 * HTTP data source for fetching data from a REST API.
 * @template T - The type of data expected from the API
 */
export class HttpDataSource<T> implements DataSource<T> {
	private url: string;
	private parser: (response: any) => T;

	/**
	 * Creates a new HTTP data source.
	 * @param url - The URL to fetch data from
	 * @param parser - Function to parse the API response
	 */
	constructor(url: string, parser: (response: any) => T) {
		this.url = url;
		this.parser = parser;
	}

	/**
	 * Fetch data from the HTTP endpoint.
	 * @returns Promise resolving to parsed data
	 */
	async fetch(): Promise<T> {
		const response = await fetch(this.url);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data = await response.json();
		return this.parser(data);
	}

	/**
	 * Get the type of this data source.
	 * @returns "http"
	 */
	getType(): "http" {
		return "http";
	}
}
