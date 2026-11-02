package fetch_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/httpx"
	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
)

// fixtureServer serves fixture files by request path; anything else is a 404.
func fixtureServer(t *testing.T, routes map[string]string) *httptest.Server {
	t.Helper()
	files := map[string][]byte{}
	for path, name := range routes {
		files[path] = testutil.ReadFile(t, "crawler/testdata/fixtures/"+name)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := files[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func client() *httpx.Client {
	return httpx.New(httpx.Options{UserAgent: "test", Sleep: func(context.Context, time.Duration) error { return nil }})
}

func fetchAll(t *testing.T, f fetch.Fetcher, c fetch.Company) []fetch.RawJob {
	t.Helper()
	jobs, err := f.Fetch(context.Background(), c)
	if err != nil {
		t.Fatal(err)
	}
	return jobs
}

func TestGreenhouse(t *testing.T) {
	srv := fixtureServer(t, map[string]string{"/v1/boards/gitlab/jobs": "greenhouse_jobs.json"})
	jobs := fetchAll(t, &fetch.Greenhouse{Client: client(), BaseURL: srv.URL}, fetch.Company{Platform: "greenhouse", Token: "gitlab"})
	if len(jobs) != 3 {
		t.Fatalf("got %d jobs", len(jobs))
	}
	j := jobs[0]
	if j.ExternalID != "8586667002" || j.Locations[0] != "Remote, United Kingdom" {
		t.Errorf("unexpected job %+v", j)
	}
	if j.ApplyURL != "https://job-boards.greenhouse.io/embed/job_app?for=gitlab&token=8586667002" {
		t.Errorf("apply URL %q", j.ApplyURL)
	}
	if !j.PostedAt.Equal(time.Date(2026, 8, 19, 15, 33, 14, 0, time.UTC)) {
		t.Errorf("postedAt %v (want first_published in UTC)", j.PostedAt)
	}
	if !strings.Contains(j.DescriptionHTML, "<") || strings.Contains(j.DescriptionHTML, "&lt;") {
		t.Error("content was not unescaped once into HTML")
	}
	if jobs[2].URL != "https://stripe.com/jobs/search?gh_jid=7984866" {
		t.Errorf("custom careers URL kept as url, got %q", jobs[2].URL)
	}
}

func TestGreenhouseNotFound(t *testing.T) {
	srv := fixtureServer(t, nil)
	_, err := (&fetch.Greenhouse{Client: client(), BaseURL: srv.URL}).Fetch(context.Background(), fetch.Company{Platform: "greenhouse", Token: "gone"})
	if !httpx.IsNotFound(err) {
		t.Fatalf("err = %v, want 404", err)
	}
}

func TestLever(t *testing.T) {
	srv := fixtureServer(t, map[string]string{"/v0/postings/palantir": "lever_postings.json"})
	jobs := fetchAll(t, &fetch.Lever{Client: client(), BaseURL: srv.URL}, fetch.Company{Platform: "lever", Token: "palantir"})
	if len(jobs) != 3 {
		t.Fatalf("got %d jobs", len(jobs))
	}
	j := jobs[0]
	if j.ExternalID != "2bc07b65-3f3a-4565-8d7c-d015bed92166" || *j.WorkplaceType != "hybrid" {
		t.Errorf("unexpected job %+v", j)
	}
	if !strings.HasPrefix(j.ApplyURL, "https://jobs.lever.co/palantir/") || j.CountryHints[0] != "US" {
		t.Errorf("apply %q hints %v", j.ApplyURL, j.CountryHints)
	}
	if !strings.Contains(j.DescriptionText, "Core Responsibilities") || strings.Contains(j.DescriptionText, "<li>") {
		t.Error("description text should include list headings as plain text")
	}
	if j.PostedAt.IsZero() || j.EmploymentType == "" {
		t.Errorf("postedAt %v employment %q", j.PostedAt, j.EmploymentType)
	}
}

func TestLeverEUUsesEUHost(t *testing.T) {
	global := fixtureServer(t, nil)
	eu := fixtureServer(t, map[string]string{"/v0/postings/acme": "lever_postings.json"})
	l := &fetch.Lever{Client: client(), BaseURL: global.URL, EUBaseURL: eu.URL}
	if jobs := fetchAll(t, l, fetch.Company{Platform: "lever", Token: "acme", Variant: "eu"}); len(jobs) != 3 {
		t.Fatalf("got %d jobs from the EU host", len(jobs))
	}
}

func TestAshby(t *testing.T) {
	srv := fixtureServer(t, map[string]string{"/posting-api/job-board/ramp": "ashby_board.json"})
	jobs := fetchAll(t, &fetch.Ashby{Client: client(), BaseURL: srv.URL}, fetch.Company{Platform: "ashby", Token: "ramp"})
	if len(jobs) != 3 {
		t.Fatalf("got %d jobs", len(jobs))
	}
	j := jobs[0]
	if *j.WorkplaceType != "Hybrid" || j.IsRemote == nil || !*j.IsRemote || j.EmploymentType != "Full-time" {
		t.Errorf("unexpected job %+v", j)
	}
	if j.Salary == nil || j.Salary.Currency != "USD" || j.Salary.Period != "year" || *j.Salary.Min != 184800 || *j.Salary.Max != 374900 {
		t.Errorf("salary %+v", j.Salary)
	}
	if !strings.HasPrefix(j.ApplyURL, "https://jobs.ashbyhq.com/ramp/") || j.DescriptionText == "" {
		t.Errorf("apply %q", j.ApplyURL)
	}
	if len(j.CountryHints) == 0 {
		t.Error("address countries should become country hints")
	}
}

func TestSmartRecruiters(t *testing.T) {
	srv := fixtureServer(t, map[string]string{
		"/v1/companies/BoschGroup/postings":                 "smartrecruiters_postings.json",
		"/v1/companies/BoschGroup/postings/744000159074300": "smartrecruiters_posting_detail.json",
	})
	sr := &fetch.SmartRecruiters{Client: client(), BaseURL: srv.URL}
	jobs := fetchAll(t, sr, fetch.Company{Platform: "smartrecruiters", Token: "BoschGroup"})
	if len(jobs) != 3 {
		t.Fatalf("got %d jobs", len(jobs))
	}
	j := jobs[0]
	if j.Locations[0] != "Pune, India" || j.CountryHints[0] != "IN" || j.EmploymentType != "Part-time" {
		t.Errorf("unexpected job %+v", j)
	}
	if j.DetailsMissing || !strings.Contains(j.DescriptionText, "About the Role") {
		t.Error("first posting should have its description from the detail endpoint")
	}
	if !strings.HasPrefix(j.ApplyURL, "https://jobs.smartrecruiters.com/BoschGroup/744000159074300") {
		t.Errorf("apply %q", j.ApplyURL)
	}
	if !jobs[1].DetailsMissing || jobs[1].ApplyURL != "https://jobs.smartrecruiters.com/BoschGroup/744000159075455" {
		t.Errorf("a failed detail fetch should leave the job without a description: %+v", jobs[1])
	}
}

func TestSmartRecruitersSkipsKnownDetails(t *testing.T) {
	var detailCalls int
	srv := fixtureServer(t, map[string]string{"/v1/companies/BoschGroup/postings": "smartrecruiters_postings.json"})
	sr := &fetch.SmartRecruiters{
		Client:  client(),
		BaseURL: srv.URL,
		HasDetails: func(fetch.Company, string) bool {
			detailCalls++
			return true
		},
	}
	jobs := fetchAll(t, sr, fetch.Company{Platform: "smartrecruiters", Token: "BoschGroup"})
	for _, j := range jobs {
		if !j.DetailsMissing {
			t.Error("known postings should not be re-fetched")
		}
	}
	if detailCalls != 3 {
		t.Errorf("HasDetails called %d times", detailCalls)
	}
}

func TestSmartRecruitersDetailCap(t *testing.T) {
	srv := fixtureServer(t, map[string]string{
		"/v1/companies/BoschGroup/postings":                 "smartrecruiters_postings.json",
		"/v1/companies/BoschGroup/postings/744000159074300": "smartrecruiters_posting_detail.json",
	})
	sr := &fetch.SmartRecruiters{Client: client(), BaseURL: srv.URL, DetailCap: 1}
	jobs := fetchAll(t, sr, fetch.Company{Platform: "smartrecruiters", Token: "BoschGroup"})
	missing := 0
	for _, j := range jobs {
		if j.DetailsMissing {
			missing++
		}
	}
	if missing != 2 {
		t.Errorf("with a cap of 1, want 2 jobs without details, got %d", missing)
	}
}

func TestWorkable(t *testing.T) {
	srv := fixtureServer(t, map[string]string{"/api/v1/widget/accounts/blueground": "workable_widget.json"})
	jobs := fetchAll(t, &fetch.Workable{Client: client(), BaseURL: srv.URL}, fetch.Company{Platform: "workable", Token: "blueground"})
	if len(jobs) != 2 {
		t.Fatalf("got %d jobs", len(jobs))
	}
	j := jobs[1]
	if j.ExternalID != "F31313C213" || j.ApplyURL != "https://apply.workable.com/j/F31313C213/apply" {
		t.Errorf("unexpected job %+v", j)
	}
	if j.Locations[0] != "Athens, Attica, Greece" || j.CountryHints[0] != "GR" {
		t.Errorf("locations %v hints %v", j.Locations, j.CountryHints)
	}
	if !j.PostedAt.Equal(time.Date(2025, 4, 23, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("postedAt %v", j.PostedAt)
	}
}

func TestSmartRecruitersKeepDropsTitlesBeforeDetails(t *testing.T) {
	var detailRequests int
	files := map[string][]byte{"/v1/companies/BoschGroup/postings": testutil.ReadFile(t, "crawler/testdata/fixtures/smartrecruiters_postings.json")}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if body, ok := files[r.URL.Path]; ok {
			_, _ = w.Write(body)
			return
		}
		detailRequests++
		http.NotFound(w, r)
	}))
	defer srv.Close()
	sr := &fetch.SmartRecruiters{Client: client(), BaseURL: srv.URL, Keep: func(title string) bool { return strings.Contains(title, "Calibration") }}
	jobs := fetchAll(t, sr, fetch.Company{Platform: "smartrecruiters", Token: "BoschGroup"})
	if len(jobs) != 1 || detailRequests != 1 {
		t.Fatalf("kept %d jobs with %d detail requests, want 1 and 1", len(jobs), detailRequests)
	}
}
