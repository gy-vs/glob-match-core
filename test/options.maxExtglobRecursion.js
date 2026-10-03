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

  it('should combine every branch of nested repeated extglobs with alternation', () => {
    assert.strictEqual(
      makeRe('+(*(a)|*(b))').source,
      '^(?:(?=.)[ab]*)$'
    );
    assert.strictEqual(
      makeRe('*(*(a)|c)').source,
      '^(?:(?=.)[ac]*)$'
    );
    assert.strictEqual(
      makeRe('+(*(a)|*(b)|*(c))').source,
      '^(?:(?=.)[abc]*)$'
    );
    assert.strictEqual(
      makeRe('*(*(a)|*(b))').source,
      '^(?:(?=.)[ab]*)$'
    );
    assert.strictEqual(
      makeRe('+(@(a)|*(b))').source,
      '^(?:(?=.)[ab]*)$'
    );
    assert.strictEqual(
      makeRe('+(a|*(b))').source,
      '^(?:(?=.)[ab]*)$'
    );
    assert.strictEqual(
      makeRe('+(*(a)|*(a))').source,
      '^(?:(?=.)a*)$'
    );

    assert(isMatch('a', '+(*(a)|*(b))'));
    assert(isMatch('b', '+(*(a)|*(b))'));
    assert(isMatch('ab', '+(*(a)|*(b))'));
    assert(isMatch('ba', '+(*(a)|*(b))'));
    assert(isMatch('aabb', '+(*(a)|*(b))'));
    assert(!isMatch('c', '+(*(a)|*(b))'));
    assert(!isMatch('abc', '+(*(a)|*(b))'));

    assert(isMatch('c', '*(*(a)|c)'));
    assert(isMatch('cca', '*(*(a)|c)'));
    assert(!isMatch('b', '*(*(a)|c)'));

    assert(isMatch('abc', '+(*(a)|*(b)|*(c))'));
    assert(!isMatch('abd', '+(*(a)|*(b)|*(c))'));
  });

  it('should combine nested repeated extglob branches inside larger patterns', () => {
    assert.strictEqual(
      makeRe('x+(*(a)|*(b))y').source,
      '^(?:x[ab]*y)$'
    );
    assert.strictEqual(
      makeRe('pre*(*(a)|*(b))post').source,
      '^(?:pre[ab]*post)$'
    );
    assert.strictEqual(
      makeRe('foo/+(*(a)|*(b))/bar').source,
      '^(?:foo\\/[ab]*\\/bar)$'
    );

    assert(isMatch('xy', 'x+(*(a)|*(b))y'));
    assert(isMatch('xaby', 'x+(*(a)|*(b))y'));
    assert(!isMatch('xcy', 'x+(*(a)|*(b))y'));
    assert(isMatch('preabpost', 'pre*(*(a)|*(b))post'));
    assert(isMatch('foo/ab/bar', 'foo/+(*(a)|*(b))/bar'));
    assert(!isMatch('foo/ac/bar', 'foo/+(*(a)|*(b))/bar'));
  });

  it('should literalize nested extglobs when a branch is not a single-character unit', () => {
    assert.strictEqual(
      makeRe('+(*(a)|foo)').source,
      '^(?:\\+\\(\\*\\(a\\)\\|foo\\))$'
    );
    assert.strictEqual(
      makeRe('+(*(a)|*(bc))').source,
      '^(?:\\+\\(\\*\\(a\\)\\|\\*\\(bc\\)\\))$'
    );

    assert(isMatch('+(*(a)|foo)', '+(*(a)|foo)'));
    assert(!isMatch('aa', '+(*(a)|foo)'));
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
});
