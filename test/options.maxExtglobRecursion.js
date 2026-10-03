'use strict';

const assert = require('assert');
const { isMatch, makeRe } = require('..');

describe('options.maxExtglobRecursion', () => {
  it('should literalize risky repeated extglobs by default', () => {
    assert.strictEqual(
      makeRe('+(a|aa)').source,
      '^(?:\\+\\(a\\|aa\\))$'
    );
    assert.strictEqual(
      makeRe('+(*|?)').source,
      '^(?:\\+\\(\\*\\|\\?\\))$'
    );
    assert.strictEqual(
      makeRe('+(+(a))').source,
      '^(?:\\+\\(\\+\\(a\\)\\))$'
    );
    assert.strictEqual(
      makeRe('*(+(a))').source,
      '^(?:\\*\\(\\+\\(a\\)\\))$'
    );

    assert(!isMatch('a'.repeat(20) + 'b', '+(a|aa)'));
    assert(!isMatch('a'.repeat(12) + '!', '+(+(a))'));
  });

  it('should preserve non-risky extglobs by default', () => {
    assert(isMatch('abcabc', '+(abc)'));
    assert(isMatch('foobar', '*(foo|bar)'));
    assert(isMatch('a', '(a|@(b|c)|d)'));
    assert(isMatch('fffooo', '*(*(f)*(o))'));
    assert(isMatch('abc', '+(*)c'));
  });

  it('should allow limited nested repeated extglobs when configured', () => {
    assert.strictEqual(
      makeRe('+(+(a))', { maxExtglobRecursion: 1 }).source,
      '^(?:(?=.)(?:(?:a)+)+)$'
    );
    assert.strictEqual(
      makeRe('*(+(a))', { maxExtglobRecursion: 1 }).source,
      '^(?:(?=.)(?:(?:a)+)*)$'
    );

    assert(isMatch('aaa', '+(+(a))', { maxExtglobRecursion: 1 }));
    assert(isMatch('aaa', '*(+(a))', { maxExtglobRecursion: 1 }));
  });

  it('should still block ambiguous repeated alternation when recursion is allowed', () => {
    assert.strictEqual(
      makeRe('+(a|aa)', { maxExtglobRecursion: 1 }).source,
      '^(?:\\+\\(a\\|aa\\))$'
    );
    assert.strictEqual(
      makeRe('+(*|?)', { maxExtglobRecursion: 1 }).source,
      '^(?:\\+\\(\\*\\|\\?\\))$'
    );
  });

  it('should rewrite risky repeated extglobs embedded in larger patterns', () => {
    assert.strictEqual(
      makeRe('foo/+(a|aa)/bar').source,
      '^(?:foo\\/\\+\\(a\\|aa\\)\\/bar)$'
    );
    assert.strictEqual(
      makeRe('x+(a|aa)y').source,
      '^(?:x\\+\\(a\\|aa\\)y)$'
    );

    assert(isMatch('foo/+(a|aa)/bar', 'foo/+(a|aa)/bar'));
    assert(!isMatch('foo/aa/bar', 'foo/+(a|aa)/bar'));
    assert(isMatch('x+(a|aa)y', 'x+(a|aa)y'));
    assert(!isMatch('xaay', 'x+(a|aa)y'));
  });

  it('should rewrite star-only repeated extglobs embedded in larger patterns', () => {
    assert.strictEqual(
      makeRe('pre*(*(f)*(o))post').source,
      '^(?:pre[fo]*post)$'
    );

    assert(isMatch('prefoopost', 'pre*(*(f)*(o))post'));
  });

  it('should rewrite star-only repeated extglobs', () => {
    assert.strictEqual(
      makeRe('*(*(f))').source,
      '^(?:(?=.)f*)$'
    );

    assert(isMatch('fff', '*(*(f))'));
  });

  it('should preserve capture behavior for rewritten repeated extglobs', () => {
    const embedded = makeRe('foo/+(a|aa)/bar', { capture: true });
    assert.strictEqual(embedded.source, '^(?:foo\\/\\+\\(a\\|aa\\)\\/bar)$');
    assert.deepStrictEqual(
      Array.from(embedded.exec('foo/+(a|aa)/bar')),
      ['foo/+(a|aa)/bar']
    );

    const simplified = makeRe('*(*(f)*(o))', { capture: true });
    assert.strictEqual(simplified.source, '^(?:(?=.)([fo]*))$');
    assert.deepStrictEqual(
      Array.from(simplified.exec('fffooo')),
      ['fffooo', 'fffooo']
    );
  });

  it('should only rewrite the risky repeated extglob when adjacent extglobs are present', () => {
    assert.strictEqual(
      makeRe('+(a|aa)@(x)').source,
      '^(?:\\+\\(a\\|aa\\)(x))$'
    );

    assert(isMatch('+(a|aa)x', '+(a|aa)@(x)'));
    assert(!isMatch('aaax', '+(a|aa)@(x)'));
  });
  it('should disable the safeguard when maxExtglobRecursion is false', () => {
    assert(
      /\(\?:a\|aa\)\+/.test(
        makeRe('+(a|aa)', { maxExtglobRecursion: false }).source
      )
    );
    assert(
      /\(\?:\(\?:a\)\+\)\+/.test(
        makeRe('+(+(a))', { maxExtglobRecursion: false }).source
      )
    );
  });

  it('should keep every branch of a nested multi-branch repeated extglob', () => {
    // The reported regression: `+(*(a)|*(b))` was compiled to `a*`, silently
    // dropping the second branch.
    assert.strictEqual(
      makeRe('+(*(a)|*(b))').source,
      '^(?:(?=.)[ab]*)$'
    );
    assert.strictEqual(
      makeRe('+(*(a)|*(b)|*(c))').source,
      '^(?:(?=.)[abc]*)$'
    );
    assert.strictEqual(
      makeRe('*(*(a)|c)').source,
      '^(?:(?=.)a*(?:(?:c)a*)*)$'
    );
    assert.strictEqual(
      makeRe('+(*(a)|cd)').source,
      '^(?:(?=.)a*(?:(?:cd)a*)*)$'
    );
  });

  it('should merge nested single-character star runs into a character class', () => {
    assert.strictEqual(makeRe('*(*(a))').source, '^(?:(?=.)a*)$');
    assert.strictEqual(makeRe('*(*(f)|*(o))').source, '^(?:(?=.)[fo]*)$');
  });

  it('should flatten a multi-character star run only against the run alphabet', () => {
    // `*(ab)` next to single-character runs over the full alphabet is an
    // unordered `[ab]*` run (matches `ba` as well as `ab`)...
    assert.strictEqual(
      makeRe('*(*(ab)|*(a)|*(b))').source,
      '^(?:(?=.)[ab]*)$'
    );

    // ...but a lone `*(abc)` only matches repeated `abc` blocks, so it is kept
    // as a fixed word next to `x` instead of flattening into `[abc]*`.
    assert.strictEqual(
      makeRe('*(x|*(abc))').source,
      '^(?:(?=.)(?:abc|x)*)$'
    );
  });

  it('should agree across makeRe, isMatch and picomatch() like bash', () => {
    const pm = require('..');
    const table = {
      '+(*(a)|*(b))': {
        a: true,
        b: true,
        ab: true,
        ba: true,
        aabb: true,
        c: false,
        ac: false
      },
      '*(*(a)|c)': {
        a: true,
        c: true,
        cc: true,
        ac: true,
        ca: true,
        x: false
      },
      '+(*(a)|cd)': {
        a: true,
        cd: true,
        acd: true,
        cda: true,
        cdcd: true,
        cdc: false,
        c: false,
        x: false
      },
      '*(*(f)|*(o))': {
        foo: true,
        ofo: true,
        x: false
      },
      '+(*(ab)|*(cd))': {
        ab: true,
        abcd: true,
        cdab: true,
        aba: false
      },
      '*(x|*(abc))': {
        abc: true,
        x: true,
        xx: true,
        a: false,
        ab: false
      }
    };

    for (const [pattern, inputs] of Object.entries(table)) {
      const regex = makeRe(pattern);
      const matcher = pm(pattern);

      for (const [input, expected] of Object.entries(inputs)) {
        assert.strictEqual(
          regex.test(input),
          expected,
          `makeRe(${pattern}) against ${input}`
        );
        assert.strictEqual(
          isMatch(input, pattern),
          expected,
          `isMatch(${input}, ${pattern})`
        );
        assert.strictEqual(
          matcher(input),
          expected,
          `picomatch(${pattern})(${input})`
        );
      }
    }
  });

  it('should not flatten ambiguous repeated-character alternations', () => {
    // A nested star run whose branches repeat the same character (`*(a|aa)`)
    // would compile to an exponentially backtracking regex if flattened, so
    // such extglobs stay literal instead.
    assert.strictEqual(
      makeRe('*(a|*(a|aa))').source,
      '^(?:\\*\\(a\\|\\*\\(a\\|aa\\)\\))$'
    );
    assert.strictEqual(
      makeRe('*(x|*(a|aa))').source,
      '^(?:\\*\\(x\\|\\*\\(a\\|aa\\)\\))$'
    );
  });
});
