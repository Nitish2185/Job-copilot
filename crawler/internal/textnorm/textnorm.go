// Package textnorm is the Go port of shared/src/parsing/normalize.ts and
// shared/src/parsing/phrase.ts. Both pass shared/testcases/normalize.cases.json;
// keep them in step.
package textnorm

import (
	"strings"
	"unicode"
)

var dashes = map[rune]bool{
	0x2010: true, 0x2011: true, 0x2012: true, 0x2013: true, 0x2014: true, 0x2015: true, 0x2212: true,
}

// Normalizer turns text into the ASCII form used for matching.
type Normalizer struct {
	fold map[rune]string
}

// NewNormalizer uses the accent-folding table from shared/data/fold.json.
func NewNormalizer(fold map[rune]string) *Normalizer {
	return &Normalizer{fold: fold}
}

// ForMatching lowercases ASCII letters, folds accented Latin letters to ASCII,
// drops combining marks, turns Unicode dashes into "-", turns every other
// non-ASCII or control character into a space, then collapses spaces and trims.
func (n *Normalizer) ForMatching(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r + ('a' - 'A'))
		case r < 0x20 || r == 0x7f:
			b.WriteByte(' ')
		case r < 0x80:
			b.WriteRune(r)
		case r >= 0x300 && r <= 0x36f:
			// combining accent mark: dropped
		case dashes[r]:
			b.WriteByte('-')
		default:
			if folded, ok := n.fold[r]; ok {
				b.WriteString(folded)
			} else {
				b.WriteByte(' ')
			}
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

// isSpace matches JavaScript's \s plus U+0085.
func isSpace(r rune) bool {
	return unicode.IsSpace(r) || r == 0xFEFF
}

// CollapseWhitespace collapses every run of whitespace into one space and trims.
func CollapseWhitespace(s string) string {
	return strings.Join(strings.FieldsFunc(s, isSpace), " ")
}

// MakeSnippet collapses whitespace, then takes whole characters while the
// UTF-16 length stays within max (the TypeScript schema's limit).
func MakeSnippet(s string, max int) string {
	collapsed := CollapseWhitespace(s)
	var b strings.Builder
	units := 0
	for _, r := range collapsed {
		size := 1
		if r >= 0x10000 {
			size = 2
		}
		if units+size > max {
			break
		}
		units += size
		b.WriteRune(r)
	}
	return b.String()
}

// IsWordChar reports ASCII lowercase letters and digits.
func IsWordChar(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
}
