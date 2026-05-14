// Mock for convert-units package for browser compatibility
// This mock provides a minimal implementation of the convert-units API
// used by the Solve engine for unit conversions

export default function convert(value?: number) {
  const mockValue = value || 0;
  
  return {
    describe: (unit: string) => ({
      measure: 'length',
      unit: unit,
      plural: unit,
      singular: unit,
      abbr: unit,
      system: 'metric'
    }),
    possibilities: (measure?: string) => {
      // Return common unit types for demo purposes
      if (measure === 'length') {
        return ['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'];
      }
      return [];
    },
    from: (unit: string) => ({
      to: (target: string) => {
        // Simple mock conversion - just return the value
        // In a real implementation, this would convert between units
        return mockValue;
      }
    })
  };
}

// Also export the type for TypeScript compatibility
export type ConvertUnits = typeof convert;
