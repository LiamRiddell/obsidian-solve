/**
 * Minimal formatting settings interface for the engine
 * This allows the engine to format values without depending on app-specific settings
 */
export interface FormattingSettings {
  floatResult: {
    decimalPlaces: number;
    enableSeperator: boolean;
  };
  numberResult: {
    decimalSeparatorLocale: string;
  };
  hexResult: {
    enablePadding: boolean;
    paddingZeros: number;
  };
  unitOfMeasurementResult: {
    decimalPlaces: number;
    unitNames: boolean;
  };
  percentageResult: {
    decimalPlaces: number;
  };
}

export const DEFAULT_FORMATTING_SETTINGS: FormattingSettings = {
  floatResult: {
    decimalPlaces: 2,
    enableSeperator: true,
  },
  numberResult: {
    decimalSeparatorLocale: "en-US",
  },
  hexResult: {
    enablePadding: false,
    paddingZeros: 0,
  },
  unitOfMeasurementResult: {
    decimalPlaces: 2,
    unitNames: true,
  },
  percentageResult: {
    decimalPlaces: 2,
  },
};
