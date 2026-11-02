package skills_test

import (
	"reflect"
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/skills"
	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

type skillCase struct {
	Text     string   `json:"text"`
	Expected []string `json:"expected"`
}

func TestTagGoldenCases(t *testing.T) {
	data := testutil.Data(t)
	tagger := skills.NewTagger(data.Skills, textnorm.NewNormalizer(data.Fold))
	cases := testutil.GoldenCases[skillCase](t, "skills.cases.json")
	if len(cases) < 120 {
		t.Fatalf("want at least 120 cases, have %d", len(cases))
	}
	for _, c := range cases {
		got := tagger.Tag(c.Text)
		if !reflect.DeepEqual(got, c.Expected) {
			t.Errorf("Tag(%q)\n got %v\nwant %v", c.Text, got, c.Expected)
		}
	}
}

func TestDictionaryIsLarge(t *testing.T) {
	if n := len(testutil.Data(t).Skills.Skills); n < 300 {
		t.Fatalf("want at least 300 skills, have %d", n)
	}
}
