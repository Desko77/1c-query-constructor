// Barrel export for all analyzer rules
import type { QueryRule } from '../rule-types.js';
import { sqa001SelectWildcard } from './sqa-001-select-wildcard.js';
import { sqa002CrossJoin } from './sqa-002-cross-join.js';
import { sqa003RedundantJoin } from './sqa-003-redundant-join.js';
import { sqa004GroupByConflict } from './sqa-004-groupby-conflict.js';
import { sqa005UnusedParam } from './sqa-005-unused-param.js';
import { sqa006UndefinedParam } from './sqa-006-undefined-param.js';

export {
  sqa001SelectWildcard,
  sqa002CrossJoin,
  sqa003RedundantJoin,
  sqa004GroupByConflict,
  sqa005UnusedParam,
  sqa006UndefinedParam,
};

export function allRules(): QueryRule[] {
  return [
    sqa001SelectWildcard,
    sqa002CrossJoin,
    sqa003RedundantJoin,
    sqa004GroupByConflict,
    sqa005UnusedParam,
    sqa006UndefinedParam,
  ];
}
