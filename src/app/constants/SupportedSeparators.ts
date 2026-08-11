// export const SUPPORTED_SEPARATOR_LOCALES = {
// 	// English locales will be detected as "en-US"
// 	English: "en-US",

// 	// Any non-English locales will be detected as "de-DE"
// 	"Non English": "de-DE",
// };

/**
 * Locale-to-label mapping for decimal separator settings.
 *
 * Maps BCP 47 locale tags to human-readable labels. Used by the
 * settings UI dropdown for choosing between English-style (`.`)
 * and non-English (`,`) decimal separators.
 *
 * @todo Allow user to set locale directly; requires grammar updates.
 */
export const SUPPORTED_SEPARATOR_LOCALES = {
	// English locales will be detected as "en-US"
	"en-US": "English",

	// Any non-English locales will be detected as "de-DE"
	"de-DE": "Non English",
};
