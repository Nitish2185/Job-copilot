package crawl

import (
	"context"
	"encoding/json"
	"os"
	"sort"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/httpx"
	"github.com/Nitish2185/Job-copilot/crawler/internal/state"
)

// Validation is one company's check result.
type Validation struct {
	Company fetch.Company
	Status  string // ok | empty | not_found | error
	Jobs    int
	Error   string
}

// Dead reports entries that validate-companies --fix removes: boards that are
// gone (404) or list no jobs. Transient errors are kept.
func (v Validation) Dead() bool {
	return v.Status == state.StatusNotFound || v.Status == state.StatusEmpty
}

// Validate fetches every company once (without SmartRecruiters details).
func Validate(ctx context.Context, companies []fetch.Company, fetchers map[string]fetch.Fetcher, concurrency int) []Validation {
	if concurrency <= 0 {
		concurrency = 8
	}
	out := make([]Validation, len(companies))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(concurrency)
	for i, c := range companies {
		g.Go(func() error {
			v := Validation{Company: c}
			f := fetchers[c.Platform]
			if f == nil {
				v.Status, v.Error = state.StatusError, "unknown platform"
				out[i] = v
				return nil
			}
			jobs, err := f.Fetch(gctx, c)
			switch {
			case err != nil && httpx.IsNotFound(err):
				v.Status = state.StatusNotFound
			case err != nil:
				v.Status, v.Error = state.StatusError, err.Error()
			case len(jobs) == 0:
				v.Status = state.StatusEmpty
			default:
				v.Status, v.Jobs = state.StatusOK, len(jobs)
			}
			out[i] = v
			return nil
		})
	}
	_ = g.Wait()
	return out
}

// ValidationFetchers are the real fetchers without SmartRecruiters detail calls.
func ValidationFetchers(client fetch.Getter) map[string]fetch.Fetcher {
	return DefaultFetchers(client, 1, func(fetch.Company, string) bool { return true })
}

// WriteCompanies rewrites companies.json, one entry per line, in the given order.
func WriteCompanies(path string, companies []fetch.Company) error {
	var b strings.Builder
	b.WriteString("[\n")
	for i, c := range companies {
		if c.Region == nil {
			c.Region = []string{}
		}
		line, err := json.Marshal(c)
		if err != nil {
			return err
		}
		b.WriteString("  ")
		b.Write(line)
		if i < len(companies)-1 {
			b.WriteString(",")
		}
		b.WriteString("\n")
	}
	b.WriteString("]\n")
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

// SortCompanies orders by platform, then name (case-insensitive).
func SortCompanies(companies []fetch.Company) {
	sort.SliceStable(companies, func(i, j int) bool {
		if companies[i].Platform != companies[j].Platform {
			return companies[i].Platform < companies[j].Platform
		}
		return strings.ToLower(companies[i].Name) < strings.ToLower(companies[j].Name)
	})
}
