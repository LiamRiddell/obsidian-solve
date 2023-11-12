import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";

export interface IDatetimeProviderSettings {
	enabled: boolean;
	parsingFormat: EDatetimeParsingFormat;
}
