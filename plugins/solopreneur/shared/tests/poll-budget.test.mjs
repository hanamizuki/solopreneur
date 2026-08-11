import test from 'node:test';
import assert from 'node:assert/strict';

import { pollBudgetSec } from '../poll-budget.mjs';

test('the codex-bot policy budgets twenty minutes', () => {
  assert.equal(pollBudgetSec({ firstWaitSec: 60, intervalSec: 60, tries: 20 }), 1260);
});

test('the default policy budgets seven minutes', () => {
  assert.equal(pollBudgetSec({ firstWaitSec: 180, intervalSec: 120, tries: 3 }), 540);
});

test('a single-try policy budgets its first wait', () => {
  assert.equal(pollBudgetSec({ firstWaitSec: 180, intervalSec: 120, tries: 1 }), 300);
});
