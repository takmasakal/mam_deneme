const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const classes = new Set(['hidden']);
const modal = {
  classList: {
    contains: (name) => classes.has(name),
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name)
  },
  querySelector: () => null,
  querySelectorAll: () => []
};
const input = { value: '' };
let focusCount = 0;
const trigger = { focus: () => { focusCount += 1; } };
const context = {
  window: {},
  document: {
    getElementById: (id) => id === 'advancedSearchModal' ? modal
      : id === 'advancedSearchBtn' ? trigger : null
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/main-advanced-search.js'), 'utf8'), context);
const search = context.window.createMainAdvancedSearchModule({
  searchForm: { querySelector: () => input }
});

// Every keystroke in normal search deactivates the advanced definition.
for (const character of 'istanbul') {
  input.value = character;
  search.deactivateForDirectSearch();
  assert.equal(input.value, '');
  assert.equal(focusCount, 0, 'Typing must not focus the advanced-search trigger');
}
search.close();
assert.equal(focusCount, 0, 'Closing an already hidden modal must not move focus');
classes.delete('hidden');
search.close();
assert.equal(focusCount, 0, 'Closing an open modal must not focus the trigger');
search.close();
assert.equal(focusCount, 0, 'Repeated close must not focus the trigger');
classes.delete('hidden');
search.deactivateForDirectSearch();
assert.equal(focusCount, 0, 'Direct search should retain focus even when closing the modal');
assert.equal(classes.has('hidden'), true);
console.log('Advanced search focus regression tests passed');
