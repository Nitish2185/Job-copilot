// Package skills is the Go port of shared/src/skills/tagger.ts. Both pass
// shared/testcases/skills.cases.json; see the TypeScript file for the algorithm.
package skills

import (
	"sort"

	"github.com/Nitish2185/Job-copilot/crawler/internal/shareddata"
	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

// Tagger finds canonical skill IDs in text.
type Tagger struct {
	norm     *textnorm.Normalizer
	aliases  []textnorm.Phrase
	contexts []textnorm.Phrase
	implies  map[string][]string
}

// NewTagger compiles the skill dictionary.
func NewTagger(dict shareddata.SkillDictionary, norm *textnorm.Normalizer) *Tagger {
	t := &Tagger{norm: norm, implies: map[string][]string{}}
	for _, s := range dict.Skills {
		for _, a := range s.Aliases {
			t.aliases = append(t.aliases, textnorm.Phrase{Text: a, Key: s.ID})
		}
		for _, p := range s.ContextPatterns {
			t.contexts = append(t.contexts, textnorm.Phrase{Text: p, Key: s.ID})
		}
		if len(s.Implies) > 0 {
			t.implies[s.ID] = s.Implies
		}
	}
	textnorm.SortPhrases(t.aliases)
	textnorm.SortPhrases(t.contexts)
	return t
}

// Tag returns sorted, de-duplicated skill IDs found in the text.
func (t *Tagger) Tag(input string) []string {
	text := t.norm.ForMatching(input)
	found := map[string]bool{}

	textnorm.MatchClaimingPhrases(text, t.aliases, func(p textnorm.Phrase) { found[p.Key] = true })

	for _, c := range t.contexts {
		if !found[c.Key] && textnorm.ContainsPhrase(text, c.Text, true) {
			found[c.Key] = true
		}
	}

	queue := make([]string, 0, len(found))
	for id := range found {
		queue = append(queue, id)
	}
	for len(queue) > 0 {
		id := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		for _, implied := range t.implies[id] {
			if !found[implied] {
				found[implied] = true
				queue = append(queue, implied)
			}
		}
	}

	out := make([]string, 0, len(found))
	for id := range found {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}
