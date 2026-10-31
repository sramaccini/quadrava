import { insertSuggestion, suggestionsOf, wordAt } from './suggest';

describe('suggestions of a text field', () => {
  it('the word at the cursor: delimited by spaces, brackets and commas', () => {
    const text = 'status:open and (assignee:an, x)';
    expect(wordAt(text, text.indexOf('an,') + 2).word).toBe('assignee:an');
    expect(wordAt(text, 3)).toEqual({ start: 0, end: 11, word: 'status:open' });
    // Right after a space or a bracket: an empty word.
    expect(wordAt('status ', 7).word).toBe('');
    expect(wordAt('(', 1).word).toBe('');
    expect(wordAt('', 0)).toEqual({ start: 0, end: 0, word: '' });
  });

  it('inserting a suggestion replaces the whole word at the cursor, or the whole text', () => {
    expect(insertSuggestion('status:op and x', 8, 'status:open')).toEqual({ text: 'status:open and x', caret: 11 });
    expect(insertSuggestion('a (b', 4, 'bug ')).toEqual({ text: 'a (bug ', caret: 7 });
    expect(insertSuggestion('status:op', 3, 'anything', 'all')).toEqual({ text: 'anything', caret: 8 });
  });

  it('suggestions from the rows: value, label and description; empty and repeated values left out', () => {
    const spec = { source: 's', valueField: 'insert', labelField: 'name', descriptionField: 'hint' };
    const rows = [
      { insert: 'status:', name: 'status', hint: 'State of the task' },
      { insert: 'status:', name: 'again' },
      { insert: '', name: 'nothing' },
      { insert: 'who:{{ user.name }}' },
      null,
    ];
    expect(suggestionsOf(rows, spec)).toEqual([
      { value: 'status:', label: 'status', description: 'State of the task' },
      // Texts from the data are never evaluated.
      { value: 'who:{{ user.name }}', label: 'who:{{ user.name }}', description: null },
    ]);
    expect(suggestionsOf({ items: [{ value: 'a' }] }, { source: 's' })).toEqual([{ value: 'a', label: 'a', description: null }]);
    expect(suggestionsOf('nope', { source: 's' })).toEqual([]);
  });
});
