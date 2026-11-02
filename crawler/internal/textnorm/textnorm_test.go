package textnorm_test

import (
	"testing"
	"unicode/utf16"

	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

type normalizeCase struct {
	Text     string `json:"text"`
	Matching string `json:"matching"`
	Snippet  string `json:"snippet"`
}

func TestNormalizeGoldenCases(t *testing.T) {
	n := textnorm.NewNormalizer(testutil.Data(t).Fold)
	for _, c := range testutil.GoldenCases[normalizeCase](t, "normalize.cases.json") {
		if got := n.ForMatching(c.Text); got != c.Matching {
			t.Errorf("ForMatching(%q)\n got %q\nwant %q", c.Text, got, c.Matching)
		}
		got := textnorm.MakeSnippet(c.Text, 300)
		if got != c.Snippet {
			t.Errorf("MakeSnippet(%q)\n got %q\nwant %q", c.Text, got, c.Snippet)
		}
		if units := len(utf16.Encode([]rune(got))); units > 300 {
			t.Errorf("snippet has %d UTF-16 units", units)
		}
	}
}

func TestContainsPhrase(t *testing.T) {
	tests := []struct {
		text, phrase string
		strict, want bool
	}{
		{"go-to-market", "go", false, true},
		{"in go-to-market", "in go", true, false},
		{"r&d team", "in r", true, false},
		{"c++ and c#", "c++ and c", true, false},
		{"python/go", "/go", false, true},
		{"django developers", "go developers", false, false},
	}
	for _, tt := range tests {
		if got := textnorm.ContainsPhrase(tt.text, tt.phrase, tt.strict); got != tt.want {
			t.Errorf("ContainsPhrase(%q, %q, %v) = %v, want %v", tt.text, tt.phrase, tt.strict, got, tt.want)
		}
	}
}
