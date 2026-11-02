package crawl_test

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/crawl"
	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
)

func TestValidate(t *testing.T) {
	companies := []fetch.Company{
		{Name: "Palantir", Platform: "lever", Token: "palantir"},
		{Name: "Gone Co", Platform: "lever", Token: "goneco"},
	}
	got := crawl.Validate(context.Background(), companies, fixtureFetchers(t, true), 2)
	if got[0].Status != "ok" || got[0].Jobs != 3 || got[0].Dead() {
		t.Errorf("palantir: %+v", got[0])
	}
	if got[1].Status != "not_found" || !got[1].Dead() {
		t.Errorf("goneco: %+v", got[1])
	}
}

func TestWriteCompaniesRoundTrips(t *testing.T) {
	path := filepath.Join(t.TempDir(), "companies.json")
	in := []fetch.Company{
		{Name: "Beta", Platform: "lever", Token: "beta", Region: []string{"IN"}},
		{Name: "alpha", Platform: "lever", Token: "alpha", Variant: "eu"},
		{Name: "Acme", Platform: "ashby", Token: "acme", Region: []string{"REMOTE"}, Tags: []string{"product"}},
	}
	crawl.SortCompanies(in)
	if err := crawl.WriteCompanies(path, in); err != nil {
		t.Fatal(err)
	}
	out, err := crawl.LoadCompanies(path)
	if err != nil {
		t.Fatal(err)
	}
	in[1].Region = []string{}
	if !reflect.DeepEqual(out, in) || out[0].Token != "acme" || out[1].Token != "alpha" {
		t.Fatalf("round trip:\n got %+v\nwant %+v", out, in)
	}
	raw, _ := os.ReadFile(path)
	if lines := len(splitLines(string(raw))); lines != 5 {
		t.Errorf("want one company per line, got %d lines", lines)
	}
}

func splitLines(s string) []string {
	var out []string
	start := 0
	for i := range len(s) {
		if s[i] == '\n' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return out
}

func TestLoadCompaniesRejectsBadEntries(t *testing.T) {
	for name, body := range map[string]string{
		"duplicate": `[{"name":"A","platform":"lever","token":"a"},{"name":"A2","platform":"lever","token":"a"}]`,
		"platform":  `[{"name":"A","platform":"naukri","token":"a"}]`,
		"token":     `[{"name":"A","platform":"lever","token":""}]`,
	} {
		path := filepath.Join(t.TempDir(), "c.json")
		_ = os.WriteFile(path, []byte(body), 0o644)
		if _, err := crawl.LoadCompanies(path); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}
}
