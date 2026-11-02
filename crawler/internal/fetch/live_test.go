//go:build live

// Live contract tests: real GET requests to each public job-board API, checking
// that the fields the crawler relies on are still there. Not run in normal CI.
//
//	go test -tags=live ./internal/fetch/
package fetch_test

import (
	"context"
	"net/url"
	"testing"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/httpx"
	"github.com/Nitish2185/Job-copilot/crawler/internal/normalize"
	"github.com/Nitish2185/Job-copilot/crawler/internal/project"
)

func TestLiveContracts(t *testing.T) {
	client := httpx.New(httpx.Options{UserAgent: project.UserAgent})
	sr := &fetch.SmartRecruiters{Client: client, DetailCap: 1}
	cases := []struct {
		fetcher fetch.Fetcher
		company fetch.Company
	}{
		{&fetch.Greenhouse{Client: client}, fetch.Company{Name: "GitLab", Platform: "greenhouse", Token: "gitlab"}},
		{&fetch.Lever{Client: client}, fetch.Company{Name: "Palantir", Platform: "lever", Token: "palantir"}},
		{&fetch.Ashby{Client: client}, fetch.Company{Name: "Ramp", Platform: "ashby", Token: "ramp"}},
		{sr, fetch.Company{Name: "Freshworks", Platform: "smartrecruiters", Token: "Freshworks"}},
		{&fetch.Workable{Client: client}, fetch.Company{Name: "Blueground", Platform: "workable", Token: "blueground"}},
	}
	allowed := map[string]bool{}
	for _, h := range normalize.AutoSubmitHosts {
		allowed[h] = true
	}
	for _, c := range cases {
		t.Run(c.company.Platform, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			jobs, err := c.fetcher.Fetch(ctx, c.company)
			if err != nil {
				t.Fatal(err)
			}
			if len(jobs) == 0 {
				t.Fatal("no jobs returned; pick another company for this contract test")
			}
			withText := 0
			for _, j := range jobs {
				if j.ExternalID == "" || j.Title == "" || j.URL == "" {
					t.Fatalf("job missing ID, title or URL: %+v", j)
				}
				u, err := url.Parse(j.ApplyURL)
				if err != nil || !allowed[u.Hostname()] {
					t.Fatalf("apply URL %q is not on an auto-submit host", j.ApplyURL)
				}
				if j.DescriptionText != "" || j.DescriptionHTML != "" {
					withText++
				}
			}
			if withText == 0 {
				t.Error("no job had a description")
			}
		})
	}
}
