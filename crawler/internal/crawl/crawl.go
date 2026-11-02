// Package crawl runs one crawl: fetch every company, normalize, diff against
// the previous run, and write the feed (spec 7).
package crawl

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/Nitish2185/Job-copilot/crawler/internal/feed"
	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/httpx"
	"github.com/Nitish2185/Job-copilot/crawler/internal/normalize"
	"github.com/Nitish2185/Job-copilot/crawler/internal/project"
	"github.com/Nitish2185/Job-copilot/crawler/internal/shareddata"
	"github.com/Nitish2185/Job-copilot/crawler/internal/state"
)

// Config for one run. Empty paths default to the repository layout.
type Config struct {
	Root          string // repository root (holds shared/data)
	DataDir       string // default <root>/data
	CompaniesPath string // default <root>/crawler/companies.json
	Now           time.Time
	Logger        *slog.Logger
	// Fetchers overrides the real API fetchers (tests use local servers).
	Fetchers           map[string]fetch.Fetcher
	CompanyConcurrency int // default 16
	DetailCap          int // SmartRecruiters detail fetches per company, default fetch.DefaultDetailCap
	// AllRoles keeps every job; by default only developer roles go into the feed.
	AllRoles bool
}

// Summary of a run, printed by the crawl command.
type Summary struct {
	Companies     int
	Succeeded     int
	Failed        int
	NotFound      []string
	Errors        []string
	OpenJobs      int
	NewJobs       int
	ClosedJobs    int
	ChangedJobs   int
	SkippedJobs   int
	FilteredJobs  int // not developer roles
	SnapshotBytes int
	Warnings      []string
}

// FailedShare is the fraction of companies whose fetch failed.
func (s Summary) FailedShare() float64 {
	if s.Companies == 0 {
		return 0
	}
	return float64(s.Failed) / float64(s.Companies)
}

func (c *Config) defaults() {
	if c.DataDir == "" {
		c.DataDir = filepath.Join(c.Root, "data")
	}
	if c.CompaniesPath == "" {
		c.CompaniesPath = filepath.Join(c.Root, "crawler", "companies.json")
	}
	if c.Now.IsZero() {
		c.Now = time.Now().UTC()
	}
	if c.Logger == nil {
		c.Logger = slog.New(slog.DiscardHandler)
	}
	if c.CompanyConcurrency == 0 {
		c.CompanyConcurrency = 16
	}
}

// NewClient is the polite HTTP client used for real runs.
func NewClient(logger *slog.Logger) *httpx.Client {
	return httpx.New(httpx.Options{UserAgent: project.UserAgent, Logger: logger})
}

// DefaultFetchers builds the real fetchers. hasDetails tells SmartRecruiters
// which postings already have descriptions from earlier runs.
func DefaultFetchers(client fetch.Getter, detailCap int, hasDetails func(fetch.Company, string) bool, keep func(title string) bool) map[string]fetch.Fetcher {
	return fetch.Registry(
		&fetch.Greenhouse{Client: client},
		&fetch.Lever{Client: client},
		&fetch.Ashby{Client: client},
		&fetch.SmartRecruiters{Client: client, DetailCap: detailCap, HasDetails: hasDetails, Keep: keep},
		&fetch.Workable{Client: client},
	)
}

// LoadCompanies reads and checks crawler/companies.json.
func LoadCompanies(path string) ([]fetch.Company, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var companies []fetch.Company
	if err := json.Unmarshal(raw, &companies); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	seen := map[string]bool{}
	valid := map[string]bool{"greenhouse": true, "lever": true, "ashby": true, "smartrecruiters": true, "workable": true}
	for i, c := range companies {
		if c.Name == "" || c.Token == "" || !valid[c.Platform] {
			return nil, fmt.Errorf("%s: entry %d is missing a name or token, or has an unknown platform", path, i)
		}
		if seen[c.Key()] {
			return nil, fmt.Errorf("%s: duplicate company %s", path, c.Key())
		}
		seen[c.Key()] = true
	}
	return companies, nil
}

// LoadSnapshot reads the previous snapshot; a missing file is an empty feed.
func LoadSnapshot(path string) ([]feed.Job, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var snap feed.Snapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return snap.Jobs, nil
}

var emptyDescHash = normalize.DescHash("")

// Run performs one crawl.
func Run(ctx context.Context, cfg Config) (Summary, error) {
	cfg.defaults()
	log := cfg.Logger
	var sum Summary

	data, err := shareddata.Load(cfg.Root)
	if err != nil {
		return sum, err
	}
	norm := normalize.New(data)
	companies, err := LoadCompanies(cfg.CompaniesPath)
	if err != nil {
		return sum, err
	}
	statePath := filepath.Join(cfg.DataDir, "state", "seen.json")
	feedDir := filepath.Join(cfg.DataDir, "feed")
	st, err := state.Load(statePath)
	if err != nil {
		return sum, err
	}
	previous, err := LoadSnapshot(filepath.Join(feedDir, "snapshot.json"))
	if err != nil {
		return sum, err
	}
	prevByID := make(map[string]feed.Job, len(previous))
	for _, j := range previous {
		prevByID[j.ID] = j
	}
	hasDetails := func(c fetch.Company, externalID string) bool {
		j, ok := prevByID[c.Platform+":"+c.Token+":"+externalID]
		return ok && j.DescHash != emptyDescHash
	}
	keep := norm.IsDeveloperRole
	if cfg.AllRoles {
		keep = func(string) bool { return true }
	}
	fetchers := cfg.Fetchers
	if fetchers == nil {
		fetchers = DefaultFetchers(NewClient(log), cfg.DetailCap, hasDetails, keep)
	}

	outcomes := make([]state.Outcome, len(companies))
	skipped := make([]int, len(companies))
	filtered := make([]int, len(companies))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(cfg.CompanyConcurrency)
	for i, c := range companies {
		g.Go(func() error {
			outcomes[i], skipped[i], filtered[i] = fetchCompany(gctx, log, fetchers[c.Platform], norm, keep, c, prevByID)
			return nil
		})
	}
	_ = g.Wait()
	if err := ctx.Err(); err != nil {
		return sum, err
	}

	res := st.Apply(previous, outcomes, cfg.Now)

	statuses := make([]feed.CompanyStatus, 0, len(companies))
	for i, c := range companies {
		entry := st.Companies[c.Key()]
		statuses = append(statuses, feed.CompanyStatus{
			Name: c.Name, Platform: c.Platform, Token: c.Token,
			JobCount: entry.JobCount, LastOkAt: entry.LastOkAt, LastStatus: entry.LastStatus,
		})
		sum.SkippedJobs += skipped[i]
		sum.FilteredJobs += filtered[i]
		switch outcomes[i].Status {
		case state.StatusNotFound:
			sum.Failed++
			sum.NotFound = append(sum.NotFound, c.Key())
		case state.StatusError:
			sum.Failed++
			sum.Errors = append(sum.Errors, c.Key())
		default:
			sum.Succeeded++
		}
	}

	written, err := feed.Write(feed.WriteInput{
		Dir: feedDir, Now: cfg.Now, Open: res.Open, New: res.New, Closed: res.Closed,
		Companies: statuses, SkillsVersion: data.Skills.Version,
	})
	if err != nil {
		return sum, err
	}
	for _, w := range written.Warnings {
		log.Warn(w)
	}
	if err := st.Save(statePath); err != nil {
		return sum, err
	}

	sum.Companies = len(companies)
	sum.OpenJobs = len(res.Open)
	sum.NewJobs = len(res.New)
	sum.ClosedJobs = len(res.Closed)
	sum.ChangedJobs = res.Changed
	sum.SnapshotBytes = written.SnapshotBytes
	sum.Warnings = written.Warnings
	sort.Strings(sum.NotFound)
	sort.Strings(sum.Errors)
	return sum, nil
}

func fetchCompany(ctx context.Context, log *slog.Logger, f fetch.Fetcher, norm *normalize.Normalizer, keep func(string) bool, c fetch.Company, prev map[string]feed.Job) (state.Outcome, int, int) {
	out := state.Outcome{Key: c.Key()}
	if f == nil {
		out.Status = state.StatusError
		return out, 0, 0
	}
	raws, err := f.Fetch(ctx, c)
	if err != nil {
		if httpx.IsNotFound(err) {
			out.Status = state.StatusNotFound
			log.Warn("company not found (moved or closed its board)", "company", c.Key())
		} else {
			out.Status = state.StatusError
			log.Warn("company fetch failed", "company", c.Key(), "error", err)
		}
		return out, 0, 0
	}
	skipped, filtered := 0, 0
	for _, r := range raws {
		if !keep(r.Title) {
			filtered++
			continue
		}
		job, err := norm.Job(c, r)
		if err != nil {
			skipped++
			log.Debug("job skipped", "company", c.Key(), "reason", err)
			continue
		}
		if r.DetailsMissing {
			if p, ok := prev[job.ID]; ok && p.DescHash != emptyDescHash {
				job.Skills, job.ExpMin, job.ExpMax, job.Snippet, job.DescHash = p.Skills, p.ExpMin, p.ExpMax, p.Snippet, p.DescHash
			}
		}
		out.Jobs = append(out.Jobs, job)
	}
	out.Status = state.StatusOK
	if len(out.Jobs) == 0 {
		out.Status = state.StatusEmpty
	}
	log.Info("company fetched", "company", c.Key(), "jobs", len(out.Jobs), "skipped", skipped, "filtered", filtered)
	return out, skipped, filtered
}
