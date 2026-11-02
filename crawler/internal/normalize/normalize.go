// Package normalize turns raw jobs from any platform into FeedJobs (spec 7.4).
// The extension has a TypeScript port for personal company boards.
package normalize

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"

	"github.com/Nitish2185/Job-copilot/crawler/internal/feed"
	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/parsing"
	"github.com/Nitish2185/Job-copilot/crawler/internal/shareddata"
	"github.com/Nitish2185/Job-copilot/crawler/internal/skills"
	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

// AutoSubmitHosts mirrors AUTO_SUBMIT_HOSTS in shared/src/config.ts. A test
// fails if the two lists differ.
var AutoSubmitHosts = []string{
	"boards.greenhouse.io",
	"job-boards.greenhouse.io",
	"jobs.lever.co",
	"jobs.eu.lever.co",
	"jobs.ashbyhq.com",
	"apply.workable.com",
	"jobs.smartrecruiters.com",
}

const snippetMax = 300

var (
	isoCountry   = regexp.MustCompile(`^[A-Za-z]{2}$`)
	currencyCode = regexp.MustCompile(`^[A-Z]{3}$`)
	noSpace      = regexp.MustCompile(`^\S+$`)
)

// Normalizer holds the compiled shared data.
type Normalizer struct {
	text      *textnorm.Normalizer
	tagger    *skills.Tagger
	locations *parsing.LocationParser
	autoHosts map[string]bool
}

// New compiles the shared data files.
func New(data *shareddata.Data) *Normalizer {
	text := textnorm.NewNormalizer(data.Fold)
	hosts := map[string]bool{}
	for _, h := range AutoSubmitHosts {
		hosts[h] = true
	}
	return &Normalizer{
		text:      text,
		tagger:    skills.NewTagger(data.Skills, text),
		locations: parsing.NewLocationParser(data.Locations, text),
		autoHosts: hosts,
	}
}

// Tagger exposes the skill tagger (used by the stats command).
func (n *Normalizer) Tagger() *skills.Tagger { return n.tagger }

// Description returns the plain-text description of a raw job.
func Description(r fetch.RawJob) string {
	if strings.TrimSpace(r.DescriptionText) != "" {
		return textnorm.PlainText(r.DescriptionText)
	}
	return textnorm.HTMLToText(r.DescriptionHTML)
}

// DescHash is the SHA-256 of the plain-text description.
func DescHash(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// ErrSkip marks raw jobs that cannot go into the feed.
var ErrSkip = errors.New("job skipped")

// Job builds a FeedJob. FirstSeenAt is left empty for the diff step to fill in.
func (n *Normalizer) Job(c fetch.Company, r fetch.RawJob) (feed.Job, error) {
	title := textnorm.CollapseWhitespace(r.Title)
	externalID := strings.TrimSpace(r.ExternalID)
	if title == "" || externalID == "" || !noSpace.MatchString(externalID) || strings.Contains(c.Token, ":") {
		return feed.Job{}, fmt.Errorf("%w: missing title or ID (%q)", ErrSkip, externalID)
	}
	applyURL := strings.TrimSpace(r.ApplyURL)
	if !n.isAutoHost(applyURL) {
		return feed.Job{}, fmt.Errorf("%w: apply URL %q is not on an auto-submit host", ErrSkip, applyURL)
	}
	pageURL := strings.TrimSpace(r.URL)
	if !isHTTPURL(pageURL) {
		pageURL = applyURL
	}

	description := Description(r)
	locations := dedupe(r.Locations)
	both := title + "\n" + description
	exp := parsing.ParseExperience(n.text, both)

	job := feed.Job{
		ID:             c.Platform + ":" + c.Token + ":" + externalID,
		Platform:       c.Platform,
		Company:        feed.Company{Name: textnorm.CollapseWhitespace(c.Name), Token: c.Token},
		Title:          title,
		Locations:      locations,
		Remote:         parsing.DetectRemote(n.text, parsing.RemoteInput{WorkplaceType: r.WorkplaceType, IsRemote: r.IsRemote, Locations: locations, Title: title}),
		CountryCodes:   n.countries(locations, r.CountryHints),
		URL:            pageURL,
		ApplyURL:       applyURL,
		Skills:         n.tagger.Tag(both),
		ExpMin:         exp.Min,
		ExpMax:         exp.Max,
		EmploymentType: textnorm.CollapseWhitespace(r.EmploymentType),
		Department:     textnorm.CollapseWhitespace(r.Department),
		Snippet:        textnorm.MakeSnippet(description, snippetMax),
		DescHash:       DescHash(description),
	}
	if !r.PostedAt.IsZero() {
		job.PostedAt = r.PostedAt.UTC().Format(feed.TimeLayout)
	}
	if s := r.Salary; s != nil && currencyCode.MatchString(s.Currency) && (s.Min != nil || s.Max != nil) {
		job.Salary = &feed.Salary{Min: s.Min, Max: s.Max, Currency: s.Currency, Period: s.Period}
	}
	return job, nil
}

func (n *Normalizer) isAutoHost(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && n.autoHosts[strings.ToLower(u.Hostname())]
}

func isHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != ""
}

func (n *Normalizer) countries(locations, hints []string) []string {
	all := map[string]bool{}
	for _, c := range n.locations.CountriesFromLocations(locations) {
		all[c] = true
	}
	for _, h := range hints {
		h = strings.TrimSpace(h)
		if isoCountry.MatchString(h) {
			all[strings.ToUpper(h)] = true
			continue
		}
		for _, c := range n.locations.Countries(h) {
			all[c] = true
		}
	}
	out := make([]string, 0, len(all))
	for c := range all {
		out = append(out, c)
	}
	sort.Strings(out)
	return out
}

func dedupe(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, v := range values {
		v = textnorm.CollapseWhitespace(v)
		if v != "" && !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}
