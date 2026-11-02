package textnorm

import (
	"sort"
	"strings"
)

// Phrase is a normalized phrase and the key it stands for (a skill ID, a country...).
type Phrase struct {
	Text string
	Key  string
}

// PhraseStartsOk: if the phrase starts with a word character, the character
// before it must not be one.
func PhraseStartsOk(text string, start int, phrase string) bool {
	if phrase == "" || !IsWordChar(phrase[0]) {
		return true
	}
	return start == 0 || !IsWordChar(text[start-1])
}

// PhraseEndsOk: if the phrase ends with a word character, the next character
// must not be a word character, "+" or "#"; in strict mode also not "-", "&", "'".
func PhraseEndsOk(text string, end int, phrase string, strict bool) bool {
	if phrase == "" || !IsWordChar(phrase[len(phrase)-1]) {
		return true
	}
	if end >= len(text) {
		return true
	}
	next := text[end]
	if IsWordChar(next) || next == '+' || next == '#' {
		return false
	}
	return !(strict && (next == '-' || next == '&' || next == '\''))
}

// indexFrom is strings.Index starting at from, returning -1 when absent.
func indexFrom(text, phrase string, from int) int {
	if from > len(text) {
		return -1
	}
	i := strings.Index(text[from:], phrase)
	if i < 0 {
		return -1
	}
	return from + i
}

// ContainsPhrase reports whether the phrase occurs as a whole phrase.
func ContainsPhrase(text, phrase string, strict bool) bool {
	for at := indexFrom(text, phrase, 0); at != -1; at = indexFrom(text, phrase, at+1) {
		if PhraseStartsOk(text, at, phrase) && PhraseEndsOk(text, at+len(phrase), phrase, strict) {
			return true
		}
	}
	return false
}

// MatchClaimingPhrases matches phrases longest first; an occurrence fully inside
// a span already claimed by a longer phrase is skipped. phrases must be sorted
// with SortPhrases.
func MatchClaimingPhrases(text string, phrases []Phrase, onMatch func(Phrase)) {
	type span struct{ start, end int }
	var claimed []span
	inside := func(start, end int) bool {
		for _, s := range claimed {
			if s.start <= start && end <= s.end {
				return true
			}
		}
		return false
	}
	for _, p := range phrases {
		for at := indexFrom(text, p.Text, 0); at != -1; at = indexFrom(text, p.Text, at+1) {
			end := at + len(p.Text)
			if PhraseStartsOk(text, at, p.Text) && PhraseEndsOk(text, end, p.Text, false) && !inside(at, end) {
				onMatch(p)
				claimed = append(claimed, span{at, end})
			}
		}
	}
}

// SortPhrases orders longest first, then by text, then by key (same as TypeScript).
func SortPhrases(phrases []Phrase) {
	sort.Slice(phrases, func(i, j int) bool {
		a, b := phrases[i], phrases[j]
		if len(a.Text) != len(b.Text) {
			return len(a.Text) > len(b.Text)
		}
		if a.Text != b.Text {
			return a.Text < b.Text
		}
		return a.Key < b.Key
	})
}
