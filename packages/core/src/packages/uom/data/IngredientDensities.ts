/**
 * Approximate ingredient densities for cooking/baking mass-volume
 * conversion (e.g. "300g butter in cups", "10 cups olive oil in grams").
 *
 * DATA ACCURACY NOTE:
 * Density is expressed in grams per millilitre (g/mL), the canonical unit
 * this table stores everything in (mass and volume, since both measures
 * this package already supports -- see uom/UomConverter.ts -- reduce to
 * grams/millilitres internally). Values are APPROXIMATE, general-knowledge
 * estimates for common preparations of each ingredient (e.g. "flour"
 * assumes spooned-and-leveled all-purpose flour, "butter" assumes standard
 * solid stick butter) -- real density varies with how an ingredient is
 * packed, sifted, its temperature, humidity, and brand. This is an
 * INHERENT approximation of any mass-to-volume cooking conversion
 * (SoulverCore's own bundled density tables carry the same caveat), not a
 * bug in this table -- treat results as close enough for a recipe, not
 * lab-precise.
 *
 * SCOPE:
 * Covers about 70 common cooking/baking ingredients -- a representative
 * subset, NOT the full ~200 SoulverCore ships. Additive and extensible:
 * add more entries here as gaps are found, no other code needs to change
 * (same "not exhaustive, extend as needed" pattern already used for
 * packages/time/timezones/CityZones.ts's city table).
 *
 * Multi-word names (e.g. "olive oil", "brown sugar") are matched via
 * MAX_INGREDIENT_NAME_WORDS-word lookahead in
 * normalizer/IngredientNameNormalizerRule.ts -- no separate phrase
 * registration needed (see that file's doc comment for why this table
 * does NOT go through IEnginePackage.phrases).
 */
export const INGREDIENT_DENSITIES: Readonly<Record<string, number>> = {
  water: 1.0,
  milk: 1.03,
  "whole milk": 1.03,
  "skim milk": 1.035,
  buttermilk: 1.03,
  "heavy cream": 1.0,
  "whipping cream": 1.0,
  "sour cream": 0.96,
  yogurt: 1.03,
  "greek yogurt": 1.05,
  "cream cheese": 1.01,
  "condensed milk": 1.3,
  "evaporated milk": 1.06,
  "coconut milk": 0.97,
  "almond milk": 1.03,
  "soy milk": 1.03,
  butter: 0.9595,
  margarine: 0.96,
  "vegetable oil": 0.92,
  "olive oil": 0.913,
  "canola oil": 0.92,
  "coconut oil": 0.92,
  "sunflower oil": 0.92,
  "sesame oil": 0.92,
  mayonnaise: 0.91,

  sugar: 0.845,
  "granulated sugar": 0.845,
  "brown sugar": 0.93,
  "powdered sugar": 0.51,
  "icing sugar": 0.51,
  honey: 1.42,
  "maple syrup": 1.32,
  "corn syrup": 1.38,
  molasses: 1.4,
  nutella: 1.14,
  "peanut butter": 1.09,

  flour: 0.53,
  "all-purpose flour": 0.53,
  "all purpose flour": 0.53,
  "bread flour": 0.54,
  "cake flour": 0.47,
  "whole wheat flour": 0.55,
  cornstarch: 0.53,
  cornmeal: 0.65,
  semolina: 0.6,
  rice: 0.79,
  "white rice": 0.79,
  "brown rice": 0.8,
  oats: 0.34,
  "rolled oats": 0.38,
  breadcrumbs: 0.43,
  yeast: 0.68,
  "dry yeast": 0.68,

  salt: 1.2,
  "table salt": 1.2,
  "kosher salt": 0.96,
  "baking powder": 0.9,
  "baking soda": 0.99,
  "cream of tartar": 0.68,
  cinnamon: 0.56,
  ginger: 0.5,
  "vanilla extract": 0.88,
  "lemon juice": 1.03,
  "lime juice": 1.02,
  "orange juice": 1.04,
  vinegar: 1.01,

  cocoa: 0.41,
  "cocoa powder": 0.41,
  "chocolate chips": 0.72,
  "chocolate chunks": 0.72,
  coconut: 0.35,
  "shredded coconut": 0.35,
  raisins: 0.68,

  almonds: 0.55,
  walnuts: 0.5,
  pecans: 0.5,
  pistachios: 0.55,
  peanuts: 0.6,

  "shredded cheese": 0.4,
  parmesan: 0.44,
  "tomato paste": 1.06,
  "tomato sauce": 1.02,
  ketchup: 1.14,
  broth: 1.0,
  stock: 1.0,
  wine: 0.99,
  beer: 1.01,
};

/**
 * Longest ingredient name (in words) this table needs to match -- bounds the
 * lookahead window IngredientNameNormalizerRule tries. Recompute if a
 * longer multi-word entry is ever added above.
 */
export const MAX_INGREDIENT_NAME_WORDS = 2;

/** Look up an ingredient's density (g/mL) by its lowercase, space-joined name. */
export function getIngredientDensity(name: string): number | undefined {
  return INGREDIENT_DENSITIES[name.toLowerCase().trim()];
}
