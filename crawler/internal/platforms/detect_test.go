package platforms_test

import (
	"encoding/json"
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/platforms"
	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
)

type urlCase struct {
	URL      string           `json:"url"`
	HTML     *string          `json:"html"`
	Expected *platforms.Match `json:"expected"`
}

func TestDetectGoldenCases(t *testing.T) {
	cases := testutil.GoldenCases[urlCase](t, "platform-urls.cases.json")
	if len(cases) < 40 {
		t.Fatalf("want at least 40 cases, have %d", len(cases))
	}
	for _, c := range cases {
		got, _ := json.Marshal(platforms.Detect(c.URL, c.HTML))
		want, _ := json.Marshal(c.Expected)
		if string(got) != string(want) {
			t.Errorf("Detect(%q)\n got %s\nwant %s", c.URL, got, want)
		}
	}
}
