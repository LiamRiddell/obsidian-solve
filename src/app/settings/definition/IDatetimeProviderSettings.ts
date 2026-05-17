import { EDatetimeParsingFormat } from "@app/constants/EDatetimeFormat";

export interface IDatetimeProviderSettings {
	enabled: boolean;
	parsingFormat: EDatetimeParsingFormat;
}
