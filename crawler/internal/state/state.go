// Package state remembers jobs across crawler runs (data/state/seen.json) and
// works out which jobs are new, changed or closed (spec 7.7).
package state

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/feed"
)

// ClosedRetention is how long closed jobs stay in the state file.
const ClosedRetention = 30 * 24 * time.Hour

// Entry is what the crawler remembers about one job.
type Entry struct {
	FirstSeenAt string `json:"firstSeenAt"`
	LastSeenAt  string `json:"lastSeenAt"`
	DescHash    string `json:"descHash"`
	CompanyKey  string `json:"companyKey"`
	ClosedAt    string `json:"closedAt,omitempty"`
}

// CompanyEntry is what the crawler remembers about one company.
type CompanyEntry struct {
	LastOkAt   string `json:"lastOkAt,omitempty"`
	LastStatus string `json:"lastStatus"`
	JobCount   int    `json:"jobCount"`
}

// State is data/state/seen.json.
type State struct {
	Jobs      map[string]Entry        `json:"jobs"`
	Companies map[string]CompanyEntry `json:"companies"`
}

// New returns an empty state.
func New() *State {
	return &State{Jobs: map[string]Entry{}, Companies: map[string]CompanyEntry{}}
}

// Load reads the state file; a missing file is an empty state.
func Load(path string) (*State, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return New(), nil
	}
	if err != nil {
		return nil, err
	}
	s := New()
	if err := json.Unmarshal(raw, s); err != nil {
		return nil, err
	}
	if s.Jobs == nil {
		s.Jobs = map[string]Entry{}
	}
	if s.Companies == nil {
		s.Companies = map[string]CompanyEntry{}
	}
	return s, nil
}

// Save writes the state file (map keys are sorted, so diffs stay small).
func (s *State) Save(path string) error {
	raw, err := json.MarshalIndent(s, "", " ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0o644)
}

// Fetch statuses, matching the public companies.json.
const (
	StatusOK       = "ok"
	StatusEmpty    = "empty"
	StatusNotFound = "not_found"
	StatusError    = "error"
)

// Outcome is one company's fetch result for this run.
type Outcome struct {
	Key    string     // "platform:token"
	Status string     // ok | empty | not_found | error
	Jobs   []feed.Job // normalized jobs, FirstSeenAt empty; only when the fetch succeeded
}

// Succeeded reports whether the company's board was read this run.
func (o Outcome) Succeeded() bool { return o.Status == StatusOK || o.Status == StatusEmpty }

// Result of applying one run to the state.
type Result struct {
	Open    []feed.Job // every open job, FirstSeenAt set, sorted by ID
	New     []feed.Job // first seen (or re-opened) this run
	Closed  []string   // IDs closed this run
	Changed int        // open jobs whose description changed
}

// Apply records this run's outcomes. Jobs of companies whose fetch failed are
// kept open from the previous snapshot and never closed. Jobs of companies that
// are no longer listed are closed.
func (s *State) Apply(previous []feed.Job, outcomes []Outcome, now time.Time) Result {
	stamp := now.UTC().Format(feed.TimeLayout)
	var res Result
	listed := map[string]bool{}

	for _, o := range outcomes {
		listed[o.Key] = true
		if !o.Succeeded() {
			kept := 0
			for _, j := range previous {
				if j.CompanyKey() == o.Key {
					res.Open = append(res.Open, j)
					kept++
				}
			}
			c := s.Companies[o.Key]
			c.LastStatus = o.Status
			c.JobCount = kept
			s.Companies[o.Key] = c
			continue
		}

		returned := map[string]bool{}
		for _, j := range o.Jobs {
			if returned[j.ID] {
				continue // a board listing the same job twice
			}
			returned[j.ID] = true
			e, known := s.Jobs[j.ID]
			isNew := false
			switch {
			case !known:
				e = Entry{FirstSeenAt: stamp}
				isNew = true
			case e.ClosedAt != "":
				e.ClosedAt = "" // re-opened: announce it again, keep the original date
				isNew = true
			case e.DescHash != j.DescHash:
				res.Changed++
			}
			e.LastSeenAt = stamp
			e.DescHash = j.DescHash
			e.CompanyKey = o.Key
			s.Jobs[j.ID] = e
			j.FirstSeenAt = e.FirstSeenAt
			if isNew {
				res.New = append(res.New, j)
			}
			res.Open = append(res.Open, j)
		}
		for id, e := range s.Jobs {
			if e.CompanyKey == o.Key && e.ClosedAt == "" && !returned[id] {
				e.ClosedAt = stamp
				s.Jobs[id] = e
				res.Closed = append(res.Closed, id)
			}
		}
		s.Companies[o.Key] = CompanyEntry{LastOkAt: stamp, LastStatus: o.Status, JobCount: len(returned)}
	}

	// Companies removed from companies.json: close their jobs, forget the company.
	for id, e := range s.Jobs {
		if !listed[e.CompanyKey] && e.ClosedAt == "" {
			e.ClosedAt = stamp
			s.Jobs[id] = e
			res.Closed = append(res.Closed, id)
		}
	}
	for key := range s.Companies {
		if !listed[key] {
			delete(s.Companies, key)
		}
	}

	// Forget jobs closed more than 30 days ago.
	for id, e := range s.Jobs {
		if e.ClosedAt == "" {
			continue
		}
		if closed, err := time.Parse(feed.TimeLayout, e.ClosedAt); err == nil && now.Sub(closed) > ClosedRetention {
			delete(s.Jobs, id)
		}
	}

	sort.Slice(res.Open, func(i, j int) bool { return res.Open[i].ID < res.Open[j].ID })
	sort.Slice(res.New, func(i, j int) bool { return res.New[i].ID < res.New[j].ID })
	sort.Strings(res.Closed)
	return res
}
