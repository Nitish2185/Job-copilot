package state

import (
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/feed"
)

var (
	day1 = time.Date(2026, 11, 1, 6, 0, 0, 0, time.UTC)
	day2 = day1.Add(24 * time.Hour)
)

func job(id, company, hash string) feed.Job {
	return feed.Job{ID: "lever:" + company + ":" + id, Platform: "lever", Company: feed.Company{Name: company, Token: company}, Title: "T", DescHash: hash}
}

func ids(jobs []feed.Job) []string {
	out := []string{}
	for _, j := range jobs {
		out = append(out, j.ID)
	}
	return out
}

func TestNewJobsGetFirstSeenAt(t *testing.T) {
	s := New()
	res := s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h1"), job("2", "acme", "h2")}}}, day1)
	if !reflect.DeepEqual(ids(res.New), []string{"lever:acme:1", "lever:acme:2"}) {
		t.Fatalf("new = %v", ids(res.New))
	}
	for _, j := range append(res.Open, res.New...) {
		if j.FirstSeenAt != "2026-11-01T06:00:00Z" {
			t.Errorf("%s firstSeenAt %q", j.ID, j.FirstSeenAt)
		}
	}
}

func TestKnownJobsKeepFirstSeenAtAndChangesAreCounted(t *testing.T) {
	s := New()
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h1"), job("2", "acme", "h2")}}}, day1)
	res := s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h1"), job("2", "acme", "CHANGED")}}}, day2)
	if len(res.New) != 0 || len(res.Closed) != 0 || res.Changed != 1 {
		t.Fatalf("new %v closed %v changed %d", ids(res.New), res.Closed, res.Changed)
	}
	if res.Open[0].FirstSeenAt != "2026-11-01T06:00:00Z" || s.Jobs["lever:acme:2"].DescHash != "CHANGED" {
		t.Errorf("firstSeenAt %q", res.Open[0].FirstSeenAt)
	}
}

func TestMissingJobsCloseWhenTheFetchSucceeded(t *testing.T) {
	s := New()
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h"), job("2", "acme", "h")}}}, day1)
	res := s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}}}, day2)
	if !reflect.DeepEqual(res.Closed, []string{"lever:acme:2"}) {
		t.Fatalf("closed = %v", res.Closed)
	}
	if s.Jobs["lever:acme:2"].ClosedAt != "2026-11-02T06:00:00Z" {
		t.Errorf("closedAt %q", s.Jobs["lever:acme:2"].ClosedAt)
	}
}

func TestFailedFetchClosesNothingAndKeepsPreviousJobs(t *testing.T) {
	s := New()
	first := s.Apply(nil, []Outcome{
		{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}},
		{Key: "lever:beta", Status: StatusOK, Jobs: []feed.Job{job("9", "beta", "h")}},
	}, day1)
	for _, status := range []string{StatusError, StatusNotFound} {
		res := s.Apply(first.Open, []Outcome{
			{Key: "lever:acme", Status: status},
			{Key: "lever:beta", Status: StatusOK, Jobs: []feed.Job{job("9", "beta", "h")}},
		}, day2)
		if len(res.Closed) != 0 {
			t.Fatalf("%s: closed %v", status, res.Closed)
		}
		if !reflect.DeepEqual(ids(res.Open), []string{"lever:acme:1", "lever:beta:9"}) {
			t.Fatalf("%s: open %v", status, ids(res.Open))
		}
		if c := s.Companies["lever:acme"]; c.LastStatus != status || c.LastOkAt != "2026-11-01T06:00:00Z" {
			t.Errorf("%s: company entry %+v", status, c)
		}
	}
}

func TestEmptyBoardClosesItsJobs(t *testing.T) {
	s := New()
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}}}, day1)
	res := s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusEmpty}}, day2)
	if !reflect.DeepEqual(res.Closed, []string{"lever:acme:1"}) {
		t.Fatalf("closed = %v", res.Closed)
	}
}

func TestReopenedJobIsNewAgainWithOriginalFirstSeenAt(t *testing.T) {
	s := New()
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}}}, day1)
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusEmpty}}, day2)
	res := s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}}}, day2.Add(time.Hour))
	if len(res.New) != 1 || res.New[0].FirstSeenAt != "2026-11-01T06:00:00Z" || s.Jobs["lever:acme:1"].ClosedAt != "" {
		t.Fatalf("new %+v entry %+v", res.New, s.Jobs["lever:acme:1"])
	}
}

func TestRemovedCompanyClosesItsJobs(t *testing.T) {
	s := New()
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}}}, day1)
	res := s.Apply(nil, nil, day2)
	if !reflect.DeepEqual(res.Closed, []string{"lever:acme:1"}) || len(s.Companies) != 0 {
		t.Fatalf("closed %v companies %v", res.Closed, s.Companies)
	}
}

func TestClosedJobsAreForgottenAfter30Days(t *testing.T) {
	s := New()
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}}}, day1)
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusEmpty}}, day2)
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusEmpty}}, day2.Add(29*24*time.Hour))
	if _, ok := s.Jobs["lever:acme:1"]; !ok {
		t.Fatal("forgotten too early")
	}
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusEmpty}}, day2.Add(31*24*time.Hour))
	if _, ok := s.Jobs["lever:acme:1"]; ok {
		t.Fatal("closed job still remembered after 30 days")
	}
}

func TestSaveAndLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "seen.json")
	s := New()
	s.Apply(nil, []Outcome{{Key: "lever:acme", Status: StatusOK, Jobs: []feed.Job{job("1", "acme", "h")}}}, day1)
	if err := s.Save(path); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(path)
	if err != nil || !reflect.DeepEqual(loaded, s) {
		t.Fatalf("loaded %+v err %v", loaded, err)
	}
	missing, err := Load(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil || len(missing.Jobs) != 0 {
		t.Fatalf("missing file: %+v %v", missing, err)
	}
}
