package normalize_test

import (
	"errors"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/normalize"
	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
)

func TestAutoSubmitHostsMatchSharedConfig(t *testing.T) {
	src := string(testutil.ReadFile(t, "shared/src/config.ts"))
	block := regexp.MustCompile(`(?s)AUTO_SUBMIT_HOSTS = \[(.*?)\] as const`).FindStringSubmatch(src)
	if block == nil {
		t.Fatal("AUTO_SUBMIT_HOSTS not found in shared/src/config.ts")
	}
	var hosts []string
	for _, m := range regexp.MustCompile(`"([^"]+)"`).FindAllStringSubmatch(block[1], -1) {
		hosts = append(hosts, m[1])
	}
	if !reflect.DeepEqual(hosts, normalize.AutoSubmitHosts) {
		t.Fatalf("Go AutoSubmitHosts %v differ from shared config %v", normalize.AutoSubmitHosts, hosts)
	}
}

func ptr[T any](v T) *T { return &v }

func TestJob(t *testing.T) {
	n := normalize.New(testutil.Data(t))
	c := fetch.Company{Name: "Acme  Inc", Platform: "lever", Token: "acme"}
	raw := fetch.RawJob{
		ExternalID:      "3f2b6c1e-8a7d-4e5f-9b0c-1d2e3f4a5b6c",
		Title:           "  Senior Backend Engineer (Go)  ",
		Locations:       []string{"Bengaluru, Karnataka", "Bengaluru, Karnataka", " "},
		CountryHints:    []string{"in"},
		WorkplaceType:   ptr("hybrid"),
		URL:             "https://jobs.lever.co/acme/3f2b6c1e-8a7d-4e5f-9b0c-1d2e3f4a5b6c",
		ApplyURL:        "https://jobs.lever.co/acme/3f2b6c1e-8a7d-4e5f-9b0c-1d2e3f4a5b6c/apply",
		PostedAt:        time.Date(2026, 10, 30, 9, 15, 0, 0, time.FixedZone("IST", 5*3600+1800)),
		DescriptionHTML: "<p>We use Golang, Kubernetes and PostgreSQL.</p><p>3-5 years of experience.</p>",
		Salary:          &fetch.Salary{Min: ptr(3000000.0), Max: ptr(4500000.0), Currency: "INR", Period: "year"},
		EmploymentType:  "Full-time",
	}
	job, err := n.Job(c, raw)
	if err != nil {
		t.Fatal(err)
	}
	if job.ID != "lever:acme:3f2b6c1e-8a7d-4e5f-9b0c-1d2e3f4a5b6c" || job.Title != "Senior Backend Engineer (Go)" || job.Company.Name != "Acme Inc" {
		t.Errorf("id/title/company: %q %q %q", job.ID, job.Title, job.Company.Name)
	}
	if !reflect.DeepEqual(job.Locations, []string{"Bengaluru, Karnataka"}) || !reflect.DeepEqual(job.CountryCodes, []string{"IN"}) {
		t.Errorf("locations %v countries %v", job.Locations, job.CountryCodes)
	}
	if job.Remote != "hybrid" || job.PostedAt != "2026-10-30T03:45:00Z" {
		t.Errorf("remote %q postedAt %q", job.Remote, job.PostedAt)
	}
	if !reflect.DeepEqual(job.Skills, []string{"go", "kubernetes", "postgresql"}) {
		t.Errorf("skills %v", job.Skills)
	}
	if job.ExpMin == nil || *job.ExpMin != 3 || job.ExpMax == nil || *job.ExpMax != 5 {
		t.Errorf("experience %v %v", job.ExpMin, job.ExpMax)
	}
	if job.Snippet != "We use Golang, Kubernetes and PostgreSQL. 3-5 years of experience." {
		t.Errorf("snippet %q", job.Snippet)
	}
	if len(job.DescHash) != 64 || job.Salary == nil || job.FirstSeenAt != "" {
		t.Errorf("hash %q salary %v firstSeen %q", job.DescHash, job.Salary, job.FirstSeenAt)
	}
}

func TestJobRejectsApplyURLsOffTheAllowlist(t *testing.T) {
	n := normalize.New(testutil.Data(t))
	c := fetch.Company{Name: "Acme", Platform: "greenhouse", Token: "acme"}
	for _, applyURL := range []string{
		"https://acme.com/careers/apply",
		"http://boards.greenhouse.io/acme/jobs/1",
		"https://boards.greenhouse.io.evil.com/acme",
		"",
	} {
		_, err := n.Job(c, fetch.RawJob{ExternalID: "1", Title: "Engineer", ApplyURL: applyURL})
		if !errors.Is(err, normalize.ErrSkip) {
			t.Errorf("apply URL %q: err = %v, want ErrSkip", applyURL, err)
		}
	}
}

func TestJobUsesApplyURLWhenPageURLIsMissing(t *testing.T) {
	n := normalize.New(testutil.Data(t))
	job, err := n.Job(fetch.Company{Name: "Acme", Platform: "workable", Token: "acme"}, fetch.RawJob{
		ExternalID: "ABC123", Title: "Engineer", ApplyURL: "https://apply.workable.com/j/ABC123/apply",
	})
	if err != nil || job.URL != job.ApplyURL || job.Snippet != "" || !strings.HasPrefix(job.DescHash, "e3b0c442") {
		t.Errorf("job %+v err %v", job, err)
	}
}
