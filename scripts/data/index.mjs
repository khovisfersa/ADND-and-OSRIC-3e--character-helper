import osric3 from './osric3.mjs';
import add1e from './add1e.mjs';
import add2e from './add2e.mjs';

export const RULESETS = { osric3, add1e, add2e };
/** Ruleset that matches ARS's systemVariant setting (0 OSRIC, 1, 2). */
export const rulesetForVariant = (variant) => Object.values(RULESETS).find((r) => r.variant === String(variant)) ?? osric3;
