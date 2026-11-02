// Package fetch reads public job-board APIs (Greenhouse, Lever, Ashby,
// SmartRecruiters, Workable) and returns raw jobs for the normalizer.
package fetch

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/httpx"
)

// Company is one entry of crawler/companies.json.
type Company struct {
	Name     string   `json:"name"`
	Platform string   `json:"platform"`
	Token    string   `json:"token"`
	Variant  string   `json:"variant,omitempty"`
	Region   []string `json:"region"`
	Tags     []string `json:"tags,omitempty"`
}

// Key identifies a company across runs: "platform:token".
func (c Company) Key() string { return c.Platform + ":" + c.Token }

// Salary as published by the API.
type Salary struct {
	Min      *float64 `json:"min,omitempty"`
	Max      *float64 `json:"max,omitempty"`
	Currency string   `json:"currency"`
	Period   string   `json:"period"`
}

// RawJob is a job as one platform describes it, before normalization.
type RawJob struct {
	ExternalID string
	Title      string
	Locations  []string
	// CountryHints are country codes or names the API gives outside location text.
	CountryHints  []string
	WorkplaceType *string
	IsRemote      *bool
	URL           string
	ApplyURL      string
	PostedAt      time.Time
	// DescriptionText is plain text; when empty, DescriptionHTML is converted.
	DescriptionText string
	DescriptionHTML string
	// DetailsMissing is true when the description was not fetched this run
	// (SmartRecruiters detail fetches are capped per run).
	DetailsMissing bool
	Salary         *Salary
	EmploymentType string
	Department     string
}

// Fetcher reads one platform's public API (spec 7.3).
type Fetcher interface {
	Platform() string
	Fetch(ctx context.Context, c Company) ([]RawJob, error)
}

// Getter is the part of httpx.Client the fetchers use.
type Getter interface {
	GetJSON(ctx context.Context, url string, v any) error
}

var _ Getter = (*httpx.Client)(nil)

// Registry returns the fetcher for each platform.
func Registry(fetchers ...Fetcher) map[string]Fetcher {
	m := make(map[string]Fetcher, len(fetchers))
	for _, f := range fetchers {
		m[f.Platform()] = f
	}
	return m
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

func floatPtr(v *float64) *float64 {
	if v == nil {
		return nil
	}
	x := *v
	return &x
}

// parseTime accepts RFC 3339 timestamps (with or without fractions) and dates.
func parseTime(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05.999999999Z0700", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

// periodFromInterval maps API pay intervals to "year" | "month" | "hour".
func periodFromInterval(interval string) string {
	i := strings.ToLower(interval)
	switch {
	case strings.Contains(i, "year") || strings.Contains(i, "annual"):
		return "year"
	case strings.Contains(i, "month"):
		return "month"
	case strings.Contains(i, "hour"):
		return "hour"
	}
	return ""
}

func errorf(c Company, format string, args ...any) error {
	return fmt.Errorf("%s %s: %s", c.Platform, c.Token, fmt.Sprintf(format, args...))
}
