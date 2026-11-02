package parsing_test

import (
	"reflect"
	"strconv"
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/parsing"
	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

func normalizer(t *testing.T) *textnorm.Normalizer {
	return textnorm.NewNormalizer(testutil.Data(t).Fold)
}

func TestExperienceGoldenCases(t *testing.T) {
	type expCase struct {
		Text     string                  `json:"text"`
		Expected parsing.ExperienceRange `json:"expected"`
	}
	norm := normalizer(t)
	for _, c := range testutil.GoldenCases[expCase](t, "experience.cases.json") {
		got := parsing.ParseExperience(norm, c.Text)
		if !reflect.DeepEqual(got, c.Expected) {
			t.Errorf("ParseExperience(%q) = %s, want %s", c.Text, show(got), show(c.Expected))
		}
	}
}

func show(r parsing.ExperienceRange) string {
	f := func(p *float64) string {
		if p == nil {
			return "-"
		}
		return strconv.FormatFloat(*p, 'g', -1, 64)
	}
	return "{min " + f(r.Min) + ", max " + f(r.Max) + "}"
}

func TestLocationGoldenCases(t *testing.T) {
	type locCase struct {
		Text     string   `json:"text"`
		Expected []string `json:"expected"`
	}
	data := testutil.Data(t)
	p := parsing.NewLocationParser(data.Locations, normalizer(t))
	for _, c := range testutil.GoldenCases[locCase](t, "location.cases.json") {
		got := p.Countries(c.Text)
		if !reflect.DeepEqual(got, c.Expected) {
			t.Errorf("Countries(%q) = %v, want %v", c.Text, got, c.Expected)
		}
	}
}

func TestRemoteGoldenCases(t *testing.T) {
	type remoteCase struct {
		Input    parsing.RemoteInput `json:"input"`
		Expected string              `json:"expected"`
	}
	norm := normalizer(t)
	for _, c := range testutil.GoldenCases[remoteCase](t, "remote.cases.json") {
		if got := parsing.DetectRemote(norm, c.Input); got != c.Expected {
			t.Errorf("DetectRemote(%+v) = %q, want %q", c.Input, got, c.Expected)
		}
	}
}

func TestSplitSegments(t *testing.T) {
	got := parsing.SplitSegments("remote - us & canada (hq)")
	want := []string{"remote", "us", "canada", "hq"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("SplitSegments = %v, want %v", got, want)
	}
}
