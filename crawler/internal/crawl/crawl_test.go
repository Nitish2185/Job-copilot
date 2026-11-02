package crawl_test

import (
	"bytes"
	"context"
	"flag"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/crawl"
	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/httpx"
	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
)

var update = flag.Bool("update", false, "rewrite testdata/golden from the current output")

const allCompanies = `[
  { "name": "GitLab", "platform": "greenhouse", "token": "gitlab", "region": ["REMOTE"] },
  { "name": "Palantir", "platform": "lever", "token": "palantir", "region": ["US"] },
  { "name": "Ramp", "platform": "ashby", "token": "ramp", "region": ["US"] },
  { "name": "Bosch Group", "platform": "smartrecruiters", "token": "BoschGroup", "region": ["IN"] },
  { "name": "Blueground", "platform": "workable", "token": "blueground", "region": ["GR"] },
  { "name": "Gone Co", "platform": "lever", "token": "goneco", "region": ["US"] }
]`

// Same list without Blueground: its jobs close on the second run.
const withoutBlueground = `[
  { "name": "GitLab", "platform": "greenhouse", "token": "gitlab", "region": ["REMOTE"] },
  { "name": "Palantir", "platform": "lever", "token": "palantir", "region": ["US"] },
  { "name": "Ramp", "platform": "ashby", "token": "ramp", "region": ["US"] },
  { "name": "Bosch Group", "platform": "smartrecruiters", "token": "BoschGroup", "region": ["IN"] },
  { "name": "Gone Co", "platform": "lever", "token": "goneco", "region": ["US"] }
]`

func fixtureFetchers(t *testing.T, withDetails bool) map[string]fetch.Fetcher {
	t.Helper()
	routes := map[string]string{
		"/v1/boards/gitlab/jobs":                            "greenhouse_jobs.json",
		"/v0/postings/palantir":                             "lever_postings.json",
		"/posting-api/job-board/ramp":                       "ashby_board.json",
		"/v1/companies/BoschGroup/postings":                 "smartrecruiters_postings.json",
		"/v1/companies/BoschGroup/postings/744000159074300": "smartrecruiters_posting_detail.json",
		"/api/v1/widget/accounts/blueground":                "workable_widget.json",
	}
	if !withDetails {
		delete(routes, "/v1/companies/BoschGroup/postings/744000159074300")
	}
	files := map[string][]byte{}
	for path, name := range routes {
		files[path] = testutil.ReadFile(t, "crawler/testdata/fixtures/"+name)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if body, ok := files[r.URL.Path]; ok {
			_, _ = w.Write(body)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	client := httpx.New(httpx.Options{UserAgent: "test", Sleep: func(context.Context, time.Duration) error { return nil }})
	return fetch.Registry(
		&fetch.Greenhouse{Client: client, BaseURL: srv.URL},
		&fetch.Lever{Client: client, BaseURL: srv.URL, EUBaseURL: srv.URL},
		&fetch.Ashby{Client: client, BaseURL: srv.URL},
		&fetch.SmartRecruiters{Client: client, BaseURL: srv.URL},
		&fetch.Workable{Client: client, BaseURL: srv.URL},
	)
}

func run(t *testing.T, dataDir, companies string, now time.Time, withDetails bool) crawl.Summary {
	t.Helper()
	path := filepath.Join(t.TempDir(), "companies.json")
	if err := os.WriteFile(path, []byte(companies), 0o644); err != nil {
		t.Fatal(err)
	}
	sum, err := crawl.Run(context.Background(), crawl.Config{
		Root: testutil.Root(t), DataDir: dataDir, CompaniesPath: path, Now: now, Fetchers: fixtureFetchers(t, withDetails),
		AllRoles: true, // the golden output covers every fixture job
	})
	if err != nil {
		t.Fatal(err)
	}
	return sum
}

func TestCrawlGoldenOutput(t *testing.T) {
	dataDir := t.TempDir()
	first := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)

	s1 := run(t, dataDir, allCompanies, first, true)
	if s1.Companies != 6 || s1.Failed != 1 || len(s1.NotFound) != 1 || s1.OpenJobs != 14 || s1.NewJobs != 14 {
		t.Fatalf("first run summary %+v", s1)
	}

	s2 := run(t, dataDir, withoutBlueground, first.Add(6*time.Hour), true)
	if s2.ClosedJobs != 2 || s2.NewJobs != 0 || s2.OpenJobs != 12 {
		t.Fatalf("second run summary %+v", s2)
	}

	golden := filepath.Join(testutil.Root(t), "crawler", "testdata", "golden", "feed")
	for _, rel := range []string{"snapshot.json", "index.json", "companies.json", "jobs/2026-11-02.json", "closed/2026-11-02.json"} {
		got, err := os.ReadFile(filepath.Join(dataDir, "feed", filepath.FromSlash(rel)))
		if err != nil {
			t.Fatal(err)
		}
		want := filepath.Join(golden, filepath.FromSlash(rel))
		if *update {
			if err := os.MkdirAll(filepath.Dir(want), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(want, got, 0o644); err != nil {
				t.Fatal(err)
			}
			continue
		}
		expected, err := os.ReadFile(want)
		if err != nil {
			t.Fatalf("%v (run `go test ./internal/crawl -update` to create golden files)", err)
		}
		if !bytes.Equal(got, expected) {
			t.Errorf("%s differs from testdata/golden (run with -update after checking the change)", rel)
		}
	}
}

func TestSecondRunReusesSmartRecruitersDescriptions(t *testing.T) {
	dataDir := t.TempDir()
	now := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	run(t, dataDir, allCompanies, now, true)
	before, _ := crawl.LoadSnapshot(filepath.Join(dataDir, "feed", "snapshot.json"))
	// The description endpoint is down on the second run.
	run(t, dataDir, allCompanies, now.Add(6*time.Hour), false)
	after, _ := crawl.LoadSnapshot(filepath.Join(dataDir, "feed", "snapshot.json"))
	find := func(jobs []feedJob, id string) feedJob {
		for _, j := range jobs {
			if j.ID == id {
				return j
			}
		}
		t.Fatalf("job %s missing", id)
		return feedJob{}
	}
	id := "smartrecruiters:BoschGroup:744000159074300"
	if b, a := find(before, id), find(after, id); b.DescHash != a.DescHash || a.Snippet == "" {
		t.Errorf("description changed between runs: %q -> %q", b.DescHash, a.DescHash)
	}
}

func TestFailedShare(t *testing.T) {
	if (crawl.Summary{Companies: 10, Failed: 6}).FailedShare() <= 0.5 {
		t.Error("6 of 10 failed should be over half")
	}
	if (crawl.Summary{}).FailedShare() != 0 {
		t.Error("no companies means no failures")
	}
}
